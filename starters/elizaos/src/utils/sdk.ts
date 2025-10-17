import path from "path";
import { pathToFileURL } from "url";

type SdkModule = Record<string, any>;

export async function loadSdk(): Promise<SdkModule> {
  let originalSdk: SdkModule = {};
  
  // Try to load from SDK package or override path
  const override = process.env.SAPIENCE_SDK_PATH;
  if (override && override.trim().length > 0) {
    try {
      const resolved = path.isAbsolute(override)
        ? override
        : path.resolve(process.cwd(), override);
      const url = pathToFileURL(resolved).href;
      originalSdk = await import(url);
    } catch (e) {
      // Fallback to package import if override fails
      try {
        originalSdk = await import("@sapience/sdk");
      } catch {
        console.warn("Failed to load @sapience/sdk, using local implementations");
      }
    }
  } else {
    try {
      originalSdk = await import("@sapience/sdk");
    } catch {
      console.warn("Failed to load @sapience/sdk, using local implementations");
    }
  }
  
  // Create a new mutable object with all SDK properties
  const sdk: SdkModule = { ...originalSdk };
  
  // Add local fallback implementations if missing from SDK
  if (!sdk.buildAttestationCalldata) {
    try {
      const { buildAttestationCalldata } = await import("../utils/eas.js");
      sdk.buildAttestationCalldata = buildAttestationCalldata;
    } catch (e) {
      console.warn("Failed to load local buildAttestationCalldata implementation:", e);
    }
  }
  
  // Add transaction functions from actions if missing
  if (!sdk.simulateTransaction) {
    sdk.simulateTransaction = async (args: any) => {
      // Simple simulation implementation using viem
      const { createPublicClient, http } = await import("viem");
      const client = createPublicClient({
        transport: http(args.rpc)
      });
      return await client.simulateContract({
        ...args.tx,
        address: args.tx.to,
        abi: [] // Empty ABI for generic calls
      });
    };
  }
  
  if (!sdk.submitTransaction) {
    sdk.submitTransaction = async (args: any) => {
      const { createWalletClient, http } = await import("viem");
      const { privateKeyToAccount } = await import("viem/accounts");
      const { arbitrum } = await import("viem/chains");
      
      if (!args.privateKey) throw new Error("Missing private key for transaction submission");
      
      const account = privateKeyToAccount(args.privateKey);
      const client = createWalletClient({
        account,
        chain: arbitrum,
        transport: http(args.rpc)
      });
      
      // Log the full transaction for debugging
      console.log("[SDK] Submitting transaction:", {
        to: args.tx.to,
        data: args.tx.data ? `${args.tx.data.slice(0, 10)}...` : undefined,
        value: args.tx.value,
        chain: "arbitrum"
      });
      
      try {
        const hash = await client.sendTransaction({
          to: args.tx.to,
          data: args.tx.data,
          value: BigInt(args.tx.value || 0),
          account,
          chain: arbitrum
        });
        
        console.log("[SDK] Transaction submitted:", hash);
        return { hash };
      } catch (error) {
        console.error("[SDK] Transaction failed:", error);
        throw error;
      }
    };
  }
  
  return sdk;
}

// Local fallback for MCP client if not available from SDK
export type LocalMcpClient = {
  callTool<T = unknown>(name: string, args?: Record<string, any>): Promise<T>;
  readResource<T = unknown>(uri: string): Promise<T>;
  close(): Promise<void>;
};

function createLocalMcpClient(opts: {
  baseUrl: string;
  fetchImpl?: (input: any, init?: any) => Promise<Response>;
  headers?: Record<string, string>;
}): LocalMcpClient {
  const fetchFn = opts.fetchImpl ?? (globalThis.fetch as any);
  const baseUrl = opts.baseUrl.replace(/\/$/, "");
  const defaultHeaders = opts.headers ?? {};

  let nextId = 1;
  let sessionId: string | null = null;

  function getMcpEndpoint(): string {
    const normalized = baseUrl.replace(/\/$/, "");
    return normalized.endsWith("/mcp") ? normalized : `${normalized}/mcp`;
  }

  async function ensureSession(): Promise<string> {
    if (sessionId) return sessionId;
    const req = {
      jsonrpc: "2.0",
      id: nextId++,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "@sapience/sdk", version: "0.1.0" },
      },
    } as const;
    const res = await fetchFn(`${getMcpEndpoint()}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...defaultHeaders,
      },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`MCP initialize failed (${res.status}): ${text}`);
    }
    const sid = res.headers.get("mcp-session-id");
    if (!sid) throw new Error("MCP initialize missing mcp-session-id");
    sessionId = sid;
    return sid;
  }

  return {
    async callTool(name, args) {
      await ensureSession();
      const req = {
        jsonrpc: "2.0",
        id: nextId++,
        method: "tools/call",
        params: { name, arguments: args || {} },
      } as const;
      const res = await fetchFn(`${getMcpEndpoint()}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "mcp-session-id": sessionId as string,
          ...defaultHeaders,
        },
        body: JSON.stringify(req),
      });
      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || json.error) {
        const message = json.error?.message || `HTTP ${res.status}`;
        throw new Error(`MCP tool error: ${message}`);
      }
      return (json.result as any) ?? (undefined as any);
    },
    async readResource(uri) {
      await ensureSession();
      const req = {
        jsonrpc: "2.0",
        id: nextId++,
        method: "resources/read",
        params: { uri },
      } as const;
      const res = await fetchFn(`${getMcpEndpoint()}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "mcp-session-id": sessionId as string,
          ...defaultHeaders,
        },
        body: JSON.stringify(req),
      });
      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || json.error) {
        const message = json.error?.message || `HTTP ${res.status}`;
        throw new Error(`MCP resource error: ${message}`);
      }
      return (json.result as any) ?? (undefined as any);
    },
    async close() {
      try {
        const sid = sessionId;
        if (!sid) return;
        await fetchFn(`${getMcpEndpoint()}`, {
          method: "DELETE",
          headers: { "mcp-session-id": sid, ...defaultHeaders },
        }).catch(() => {});
      } finally {
        sessionId = null;
      }
    },
  };
}

export async function loadCreateMcpClient(): Promise<
  (opts: Parameters<typeof createLocalMcpClient>[0]) => LocalMcpClient
> {
  try {
    const mod = await loadSdk();
    if (mod && typeof mod.createMcpClient === "function") {
      return mod.createMcpClient.bind(mod);
    }
  } catch {}
  // Fallback to local implementation
  return (opts) => createLocalMcpClient(opts);
}

