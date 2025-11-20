declare module "@sapience/sdk" {
  export type McpClient = {
    callTool<T = unknown>(name: string, args?: Record<string, any>): Promise<T>;
    readResource<T = unknown>(uri: string): Promise<T>;
    close(): Promise<void>;
  };
  export function createMcpClient(opts: {
    baseUrl: string;
    fetchImpl?: (input: any, init?: any) => Promise<Response>;
    headers?: Record<string, string>;
  }): McpClient;

  export function listActiveMarkets(client: McpClient): Promise<any[]>;
  export function getRecentAttestations(
    client: McpClient,
    limit: number,
  ): Promise<any[]>;
  export function getAttestationsByAddress(
    client: McpClient,
    address: string,
  ): Promise<any[]>;

  export type AttestationCalldata = {
    to: `0x${string}`;
    data: `0x${string}`;
    value: string;
    chainId: number;
    description: string;
  };
  export function buildAttestationCalldata(
    market: { marketId: number; address: `0x${string}`; question: string },
    prediction: { probability: number; reasoning: string; confidence: number },
    chainId: number,
    conditionId?: `0x${string}`,
  ): Promise<AttestationCalldata | null>;
  export function decodeProbabilityFromUint160(value: string): number | null;

  export function simulateTransaction(args: {
    rpc: string;
    tx: { to: `0x${string}`; data?: `0x${string}`; value?: bigint | string };
  }): Promise<{ result: any }>;
  export function submitTransaction(args: {
    rpc: string;
    privateKey?: `0x${string}`;
    account?: any;
    tx: { to: `0x${string}`; data?: `0x${string}`; value?: bigint | string };
  }): Promise<{ hash: `0x${string}` }>;
  export function postForecastAttestation(args: {
    market: { marketId: number; address: `0x${string}`; question: string };
    prediction: { probability: number; reasoning: string; confidence: number };
    chainId: number;
    conditionId?: `0x${string}`;
    rpc: string;
    privateKey?: `0x${string}`;
    account?: any;
  }): Promise<{ hash: `0x${string}`; calldata: AttestationCalldata }>;
}
