'use client';

import { Label } from '@sapience/ui/components/ui/label';
import { Input } from '@sapience/ui/components/ui/input';
import Slider from '@sapience/ui/components/ui/slider';

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@sapience/ui/components/ui/command';
import { Textarea } from '@sapience/ui/components/ui/textarea';
import { Switch } from '@sapience/ui/components/ui/switch';
import {
  Tabs,
  TabsTrigger,
  TabsContent,
} from '@sapience/ui/components/ui/tabs';
import { Card, CardContent } from '@sapience/ui/components/ui/card';
import {
  Monitor,
  Key,
  Share2,
  Bot,
  Clock,
  ShieldCheck,
  ShieldX,
  Sparkles,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@sapience/ui/components/ui/button';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useConnectedWallet } from '~/hooks/useConnectedWallet';
import { useChat } from '~/lib/context/ChatContext';
import { useSettings } from '~/lib/context/SettingsContext';
import { useSessionKey } from '~/lib/context/SessionKeyContext';
import Loader from '~/components/shared/Loader';
import SegmentedTabsList from '~/components/shared/SegmentedTabsList';

const CHAIN_ID_ARBITRUM = '42161';
const CHAIN_ID_ETHEREAL = '5064014';
const CHAIN_ID_STORAGE_KEY = 'sapience.settings.selectedChainId';
const RPC_STORAGE_KEY = 'sapience.settings.selectedRpcURL';
const SESSION_MODE_STORAGE_KEY = 'sapience.settings.sessionMode';
const SESSION_LENGTH_STORAGE_KEY = 'sapience.settings.sessionLengthHours';

type SettingFieldProps = {
  id: string;
  value: string;
  setValue: (v: string) => void;
  defaultValue: string;
  onPersist: (v: string | null) => void;
  validate: (v: string) => boolean;
  normalizeOnChange?: (v: string) => string;
  invalidMessage: string;
  type?: 'text' | 'password';
  placeholder?: string;
  clearOnEmpty?: boolean;
  maskAfterPersist?: boolean;
  disabled?: boolean;
  showResetButton?: boolean;
};

const SettingField = ({
  id,
  value,
  setValue,
  defaultValue,
  onPersist,
  validate,
  normalizeOnChange,
  invalidMessage,
  type = 'text',
  placeholder,
  clearOnEmpty = true,
  maskAfterPersist = false,
  disabled = false,
  showResetButton = true,
}: SettingFieldProps) => {
  const [draft, setDraft] = useState<string>(value);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isFocused, setIsFocused] = useState(false);

  // Sync external value when not actively focused to avoid breaking edits
  useEffect(() => {
    if (!isFocused) {
      setDraft(value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === draft) return;
    setDraft(raw);
    if (!raw) {
      setErrorMsg(null);
      return;
    }
    if (validate(raw)) {
      setErrorMsg(null);
    } else {
      setErrorMsg(invalidMessage);
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    if (!draft) {
      if (clearOnEmpty) {
        onPersist(null);
        setValue('');
      }
      return;
    }
    const normalized = normalizeOnChange ? normalizeOnChange(draft) : draft;
    setDraft(normalized);
    setValue(normalized);
    if (validate(normalized)) {
      setErrorMsg(null);
      onPersist(normalized);
      if (maskAfterPersist) {
        // Clear visible value after persisting so secret remains hidden
        setDraft('');
        setValue('');
      }
    } else {
      setErrorMsg(invalidMessage);
    }
  };

  const showReset = showResetButton && draft !== defaultValue;

  return (
    <div className="w-full">
      <div className="flex gap-3 items-start">
        <div className="flex-1">
          <Input
            id={id}
            value={draft}
            onChange={handleChange}
            onBlur={handleBlur}
            onFocus={() => setIsFocused(true)}
            type={type}
            placeholder={placeholder}
            disabled={disabled}
          />
        </div>
        {showReset ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-10"
            onClick={() => {
              setDraft(defaultValue);
              setValue(defaultValue);
              setErrorMsg(null);
              onPersist(null);
            }}
          >
            Reset
          </Button>
        ) : null}
      </div>
      {errorMsg ? (
        <p className="mt-2 text-xs text-red-500">{errorMsg}</p>
      ) : null}
    </div>
  );
};

const SettingsPageContent = () => {
  const { openChat } = useChat();
  const {
    graphqlEndpoint,
    apiBaseUrl,
    chatBaseUrl,
    rpcURL,
    openrouterApiKey,
    researchAgentSystemMessage,
    researchAgentModel,
    researchAgentTemperature,
    showAmericanOdds,
    setGraphqlEndpoint,
    setApiBaseUrl,
    setChatBaseUrl,
    setRpcUrl,
    setOpenrouterApiKey,
    setResearchAgentSystemMessage,
    setResearchAgentModel,
    setResearchAgentTemperature,
    setShowAmericanOdds,
    defaults,
  } = useSettings();
  const [mounted, setMounted] = useState(false);
  const [gqlInput, setGqlInput] = useState('');
  const [apiInput, setApiInput] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [rpcInput, setRpcInput] = useState('');
  const [openrouterKeyInput, setOpenrouterKeyInput] = useState('');
  const [systemMessageInput, setSystemMessageInput] = useState('');
  const [modelInput, setModelInput] = useState('');
  const [temperatureInput, setTemperatureInput] = useState<number>(0.7);
  const [isModelFocused, setIsModelFocused] = useState(false);
  const [activeTab, setActiveTab] = useState<
    'network' | 'appearance' | 'agent'
  >('network');
  const [selectedChain, setSelectedChain] = useState<
    'arbitrum' | 'ethereal' | null
  >(null);
  const [sessionMode, setSessionMode] = useState<'every' | 'periodically'>(
    'periodically'
  );
  const [sessionLengthHours, setSessionLengthHours] = useState<number>(24);
  const { ready, exportWallet } = usePrivy();
  const { wallets } = useWallets();
  const activeWallet = (
    wallets && wallets.length > 0 ? (wallets[0] as any) : undefined
  ) as (typeof wallets extends Array<infer T> ? T : any) | undefined;
  const isActiveEmbeddedWallet = Boolean(
    (activeWallet as any)?.walletClientType === 'privy'
  );
  const { hasConnectedWallet } = useConnectedWallet();

  // Session key management
  const {
    hasValidSession,
    expiresAt: sessionExpiresAt,
    sessionAccount,
    createSession,
    revokeSession,
    refreshSession,
    isZeroDevMode,
    smartAccountAddress,
    isZeroDevSupported,
    isCreating: isCreatingSession,
    error: sessionContextError,
  } = useSessionKey();
  const [sessionError, setSessionError] = useState<string | null>(null);

  // Combine context error with local error
  const displaySessionError = sessionError || sessionContextError;

  // Validation hints handled within SettingField to avoid parent re-renders breaking focus
  const [hydrated, setHydrated] = useState(false);

  // Handle session creation
  const handleCreateSession = useCallback(async () => {
    if (!hasConnectedWallet) {
      setSessionError('Please connect a wallet first');
      return;
    }
    setSessionError(null);
    try {
      const result = await createSession();
      if (!result.success) {
        setSessionError(result.error || 'Failed to create session');
      }
    } catch (err) {
      setSessionError(
        err instanceof Error ? err.message : 'Failed to create session'
      );
    }
  }, [createSession, hasConnectedWallet]);

  // Handle session revocation
  const handleRevokeSession = useCallback(() => {
    revokeSession();
    setSessionError(null);
  }, [revokeSession]);

  // Format session expiry for display
  const formatSessionExpiry = useCallback(
    (expiresAt: number | null): string => {
      if (!expiresAt) return '';
      const now = Date.now();
      const remaining = expiresAt - now;
      if (remaining <= 0) return 'Expired';

      const hours = Math.floor(remaining / (1000 * 60 * 60));
      const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

      if (hours > 0) {
        return `${hours}h ${minutes}m remaining`;
      }
      return `${minutes}m remaining`;
    },
    []
  );

  // Refresh session when session mode changes
  useEffect(() => {
    if (mounted) {
      refreshSession();
    }
  }, [sessionMode, mounted, refreshSession]);

  // Initialize selectedChain from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const chainIdLocalStorage =
      window.localStorage.getItem(CHAIN_ID_STORAGE_KEY);

    if (chainIdLocalStorage === CHAIN_ID_ETHEREAL) {
      setSelectedChain('ethereal');
    } else if (chainIdLocalStorage === CHAIN_ID_ARBITRUM) {
      setSelectedChain('arbitrum');
    } else {
      // Default to Ethereal when there is no stored value or an unknown value
      setSelectedChain('ethereal');
    }
    setRpcInput(
      window.localStorage.getItem(RPC_STORAGE_KEY) || defaults.rpcURL
    );

    // Initialize session settings from localStorage
    const storedSessionMode = window.localStorage.getItem(
      SESSION_MODE_STORAGE_KEY
    );
    if (storedSessionMode === 'every' || storedSessionMode === 'periodically') {
      setSessionMode(storedSessionMode);
    }
    const storedSessionLength = window.localStorage.getItem(
      SESSION_LENGTH_STORAGE_KEY
    );
    if (storedSessionLength) {
      const parsed = parseInt(storedSessionLength, 10);
      if (!Number.isNaN(parsed) && parsed > 0) {
        setSessionLengthHours(parsed);
      }
    }
  }, []);

  // Update RPC input, selected chain ID, and persisted RPC override when the selection changes
  useEffect(() => {
    const ETHEREAL_RPC = 'https://rpc.ethereal.trade';
    if (typeof window === 'undefined' || !selectedChain) return;

    const nextChainId =
      selectedChain === 'ethereal' ? CHAIN_ID_ETHEREAL : CHAIN_ID_ARBITRUM;
    const nextRpcUrl =
      selectedChain === 'ethereal' ? ETHEREAL_RPC : defaults.rpcURL;

    try {
      setRpcInput(nextRpcUrl);
      setRpcUrl(nextRpcUrl);
      window.localStorage.setItem(CHAIN_ID_STORAGE_KEY, nextChainId);
    } catch {
      // no-op
    }
  }, [selectedChain, defaults.rpcURL, setRpcUrl]);

  // override from SettingsContext if exists for first render after mount
  useEffect(() => {
    if (!mounted) return;
    if (typeof window === 'undefined') return;
    setRpcInput(rpcURL || '');
    window.localStorage.setItem(RPC_STORAGE_KEY, rpcURL || '');
  }, [rpcURL, mounted]);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Sync active tab with URL hash (#network | #appearance | #agent)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncFromHash = () => {
      const hash = window.location.hash;
      if (hash === '#agent') {
        setActiveTab('agent');
      } else if (hash === '#appearance') {
        setActiveTab('appearance');
      } else {
        // Support legacy '#configuration' by mapping to 'network'
        setActiveTab('network');
      }
    };
    syncFromHash();
    window.addEventListener('hashchange', syncFromHash);
    return () => window.removeEventListener('hashchange', syncFromHash);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    setGqlInput(graphqlEndpoint || defaults.graphqlEndpoint);
    setApiInput(apiBaseUrl ?? defaults.apiBaseUrl);
    setChatInput(chatBaseUrl ?? defaults.chatBaseUrl);
    // If a key exists, show masked dots and disable input
    setOpenrouterKeyInput(
      openrouterApiKey
        ? '••-••-••-••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••'
        : ''
    );
    setSystemMessageInput(researchAgentSystemMessage ?? '');
    setModelInput(researchAgentModel ?? defaults.researchAgentModel);
    setTemperatureInput(
      researchAgentTemperature ?? defaults.researchAgentTemperature
    );
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  // Keep the displayed OpenRouter key masked when a key exists
  useEffect(() => {
    if (!hydrated) return;
    setOpenrouterKeyInput(
      openrouterApiKey
        ? '••-••-••-••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••'
        : ''
    );
  }, [openrouterApiKey, hydrated]);

  const suggestedModels = [
    'anthropic/claude-sonnet-4:online',
    'anthropic/claude-opus-4.1:online',
    'openai/gpt-5:online',
    'perplexity/sonar:online',
    'perplexity/sonar-deep-research:online',
    'perplexity/sonar-pro:online',
  ];
  const trimmedModelInput = (modelInput || '').toLowerCase().trim();
  const displayModelSuggestions =
    trimmedModelInput.length === 0
      ? suggestedModels
      : suggestedModels.filter((m) =>
          m.toLowerCase().includes(trimmedModelInput)
        );
  const isModelSuggestOpen =
    isModelFocused &&
    displayModelSuggestions.length > 0 &&
    (trimmedModelInput.length === 0 || trimmedModelInput.length >= 2);

  const isHttpUrl = (value: string) => {
    try {
      const u = new URL(value);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
      return false;
    }
  };

  const normalizeBase = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return '';
    return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
  };

  return (
    <div className="relative min-h-screen">
      {/* Main Content */}
      <div className="container max-w-[750px] mx-auto px-4 pt-10 md:pt-14 lg:pt-16 pb-12 relative z-10">
        <h1 className="text-3xl md:text-5xl font-sans font-normal mb-6 text-foreground">
          Settings
        </h1>

        {!hydrated ? (
          <div className="h-[720px] flex items-center justify-center">
            <Loader size={20} />
          </div>
        ) : (
          <Tabs
            value={activeTab}
            onValueChange={(val) => {
              setActiveTab(val as 'network' | 'appearance' | 'agent');
              try {
                if (typeof window === 'undefined') return;
                const url = new URL(window.location.href);
                if (val === 'agent') {
                  url.hash = '#agent';
                } else if (val === 'appearance') {
                  url.hash = '#appearance';
                } else {
                  url.hash = '#network';
                }
                window.history.replaceState({}, '', url.toString());
              } catch {
                /* noop */
              }
            }}
            className="w-full"
          >
            <div className="mb-3">
              <SegmentedTabsList>
                <TabsTrigger value="network">
                  <span className="inline-flex items-center gap-1.5">
                    <Share2 className="w-4 h-4" />
                    Network
                  </span>
                </TabsTrigger>
                <TabsTrigger value="agent">
                  <span className="inline-flex items-center gap-1.5">
                    <Bot className="w-4 h-4" />
                    Agent
                  </span>
                </TabsTrigger>
                <TabsTrigger value="appearance">
                  <span className="inline-flex items-center gap-1.5">
                    <Monitor className="w-4 h-4" />
                    Appearance
                  </span>
                </TabsTrigger>
              </SegmentedTabsList>
            </div>

            <TabsContent value="network">
              <Card className="bg-background">
                <CardContent className="p-8">
                  <div className="space-y-6">
                    <div className="grid gap-2">
                      <Label htmlFor="session-mode">Transaction Signing</Label>
                      <div id="session-mode">
                        <Tabs
                          value={sessionMode}
                          onValueChange={(v) => {
                            const next = v as 'every' | 'periodically';
                            setSessionMode(next);
                            try {
                              window.localStorage.setItem(
                                SESSION_MODE_STORAGE_KEY,
                                next
                              );
                            } catch {
                              // no-op
                            }
                          }}
                        >
                          <SegmentedTabsList>
                            <TabsTrigger value="every">
                              Sign every transaction
                            </TabsTrigger>
                            <TabsTrigger value="periodically">
                              Sign periodically
                            </TabsTrigger>
                          </SegmentedTabsList>
                        </Tabs>
                      </div>
                    </div>

                    {sessionMode === 'periodically' ? (
                      <>
                        <div className="grid gap-2">
                          <Label htmlFor="session-length">
                            Session Duration
                          </Label>
                          <div className="flex w-fit">
                            <Input
                              id="session-length"
                              type="number"
                              min={1}
                              value={sessionLengthHours}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                if (!Number.isNaN(val) && val > 0) {
                                  setSessionLengthHours(val);
                                  try {
                                    window.localStorage.setItem(
                                      SESSION_LENGTH_STORAGE_KEY,
                                      String(val)
                                    );
                                  } catch {
                                    // no-op
                                  }
                                }
                              }}
                              className="w-[100px] rounded-r-none border-r-0"
                            />
                            <span className="inline-flex items-center h-10 rounded-md rounded-l-none border border-input border-l-0 bg-muted/30 px-3 text-sm text-muted-foreground whitespace-nowrap">
                              hours
                            </span>
                          </div>
                        </div>

                        {/* Session Mode Indicator */}
                        {isZeroDevSupported ? (
                          <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-purple-500/10 border border-purple-500/30">
                            <Sparkles className="h-4 w-4 text-purple-500" />
                            <span className="text-sm text-purple-500 font-medium">
                              Smart Account Mode
                            </span>
                            <span className="text-xs text-muted-foreground">
                              ERC-1271 compatible signatures
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-yellow-500/10 border border-yellow-500/30">
                            <ShieldX className="h-4 w-4 text-yellow-500" />
                            <span className="text-sm text-yellow-500 font-medium">
                              Local Mode
                            </span>
                            <span className="text-xs text-muted-foreground">
                              Configure NEXT_PUBLIC_ZERODEV_PROJECT_ID for smart
                              accounts
                            </span>
                          </div>
                        )}

                        {/* Session Status and Management */}
                        <div className="grid gap-2">
                          <Label>Session Status</Label>
                          <div className="flex items-center gap-3">
                            {hasValidSession ? (
                              <>
                                <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-green-500/10 border border-green-500/30">
                                  <ShieldCheck className="h-4 w-4 text-green-500" />
                                  <span className="text-sm text-green-500 font-medium">
                                    Active
                                  </span>
                                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {formatSessionExpiry(sessionExpiresAt)}
                                  </span>
                                </div>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={handleRevokeSession}
                                  className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                                >
                                  <ShieldX className="h-4 w-4 mr-1" />
                                  Revoke
                                </Button>
                              </>
                            ) : (
                              <>
                                <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/30 border border-border">
                                  <ShieldX className="h-4 w-4 text-muted-foreground" />
                                  <span className="text-sm text-muted-foreground">
                                    No active session
                                  </span>
                                </div>
                                <Button
                                  variant="default"
                                  size="sm"
                                  onClick={handleCreateSession}
                                  disabled={
                                    isCreatingSession || !hasConnectedWallet
                                  }
                                >
                                  {isCreatingSession ? (
                                    <>
                                      <LottieLoader width={16} height={16} />
                                      <span className="ml-2">Creating...</span>
                                    </>
                                  ) : (
                                    <>
                                      <ShieldCheck className="h-4 w-4 mr-1" />
                                      Create Session
                                    </>
                                  )}
                                </Button>
                              </>
                            )}
                          </div>
                          {displaySessionError ? (
                            <p className="text-xs text-red-500">
                              {displaySessionError}
                            </p>
                          ) : null}
                          {hasValidSession &&
                          isZeroDevMode &&
                          smartAccountAddress ? (
                            <p className="text-xs text-muted-foreground font-mono">
                              Smart account: {smartAccountAddress.slice(0, 6)}
                              ...{smartAccountAddress.slice(-4)}
                            </p>
                          ) : hasValidSession && sessionAccount ? (
                            <p className="text-xs text-muted-foreground font-mono">
                              Session key: {sessionAccount.address.slice(0, 6)}
                              ...{sessionAccount.address.slice(-4)}
                            </p>
                          ) : null}
                          <p className="text-xs text-muted-foreground">
                            {hasValidSession
                              ? isZeroDevMode
                                ? 'Bids will be signed automatically using your smart account session key. Signatures are ERC-1271 compatible.'
                                : 'Bids will be signed automatically using your authorized session key.'
                              : isZeroDevSupported
                                ? 'Create a session to authorize automatic bid signing via your smart account.'
                                : 'Create a session to authorize automatic bid signing. Note: Local mode signatures may not work with on-chain verification.'}
                          </p>
                        </div>
                      </>
                    ) : null}

                    <div className="grid gap-2">
                      <Label htmlFor="chain-selector">Chain</Label>
                      <div id="chain-selector">
                        <Tabs
                          value={selectedChain ?? 'ethereal'}
                          onValueChange={(v) => {
                            const next = v as 'arbitrum' | 'ethereal';
                            setSelectedChain(next);
                          }}
                        >
                          <SegmentedTabsList>
                            <TabsTrigger value="ethereal">Ethereal</TabsTrigger>
                            <TabsTrigger value="arbitrum">Arbitrum</TabsTrigger>
                          </SegmentedTabsList>
                        </Tabs>
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="network-rpc-endpoint">
                        Network RPC Endpoint
                      </Label>
                      <SettingField
                        id="network-rpc-endpoint"
                        value={rpcInput}
                        setValue={setRpcInput}
                        defaultValue={defaults.rpcURL}
                        onPersist={setRpcUrl}
                        validate={isHttpUrl}
                        normalizeOnChange={(s) => s.trim()}
                        invalidMessage="Must be an absolute http(s) URL"
                        showResetButton={false}
                      />
                      <p className="text-xs text-muted-foreground">
                        {selectedChain === 'arbitrum' ? (
                          <>
                            JSON-RPC URL for the{' '}
                            <a
                              href="https://chainlist.org/chain/42161"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-muted-foreground hover:text-foreground transition-colors"
                            >
                              Arbitrum
                            </a>{' '}
                            network
                          </>
                        ) : (
                          <>JSON-RPC URL for the Ethereal network</>
                        )}
                      </p>
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="graphql-endpoint">GraphQL Endpoint</Label>
                      <SettingField
                        id="graphql-endpoint"
                        value={gqlInput}
                        setValue={setGqlInput}
                        defaultValue={defaults.graphqlEndpoint}
                        onPersist={setGraphqlEndpoint}
                        validate={isHttpUrl}
                        invalidMessage="Must be an absolute http(s) URL"
                      />
                      <p className="text-xs text-muted-foreground">
                        Used to fetch metadata, historical data, and onchain
                        data via GraphQL
                      </p>
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="relayer-endpoint">Relayer Endpoint</Label>
                      <SettingField
                        id="relayer-endpoint"
                        value={apiInput}
                        setValue={setApiInput}
                        defaultValue={defaults.apiBaseUrl}
                        onPersist={setApiBaseUrl}
                        validate={isHttpUrl}
                        normalizeOnChange={normalizeBase}
                        invalidMessage="Must be an absolute http(s) base URL"
                      />
                      <p className="text-xs text-muted-foreground">
                        Used to relay bids for positions
                      </p>
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="chat-endpoint">Chat Endpoint</Label>
                      <SettingField
                        id="chat-endpoint"
                        value={chatInput}
                        setValue={setChatInput}
                        defaultValue={defaults.chatBaseUrl}
                        onPersist={setChatBaseUrl}
                        validate={isHttpUrl}
                        normalizeOnChange={normalizeBase}
                        invalidMessage="Must be an absolute http(s) base URL"
                      />
                      <p className="text-xs text-muted-foreground">
                        Used by the{' '}
                        <button
                          type="button"
                          onClick={openChat}
                          className="underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-muted-foreground hover:text-foreground transition-colors"
                        >
                          chat widget
                        </button>{' '}
                        to send and receive signed messages
                      </p>
                    </div>

                    {ready && isActiveEmbeddedWallet ? (
                      <div className="grid gap-2">
                        <Label htmlFor="export-wallet">Back Up Account</Label>
                        <div id="export-wallet">
                          <Button
                            onClick={exportWallet}
                            disabled={
                              !(
                                ready &&
                                isActiveEmbeddedWallet &&
                                hasConnectedWallet
                              )
                            }
                            size="sm"
                          >
                            <Key className="h-4 w-4" />
                            Export Private Key
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="appearance">
              <Card className="bg-background">
                <CardContent className="p-8">
                  <div className="space-y-6">
                    <div className="grid gap-1">
                      <Label htmlFor="show-american-odds">
                        Show American Odds
                      </Label>
                      <div
                        id="show-american-odds"
                        className="flex items-center h-10"
                      >
                        <Switch
                          checked={Boolean(
                            showAmericanOdds ?? defaults.showAmericanOdds
                          )}
                          onCheckedChange={(val) => setShowAmericanOdds(val)}
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="agent">
              <Card className="bg-background">
                <CardContent className="px-6 py-8">
                  <div className="space-y-6">
                    <div className="grid gap-2">
                      <Label htmlFor="research-openrouter-key">
                        OpenRouter API Key
                      </Label>
                      <SettingField
                        id="research-openrouter-key"
                        value={openrouterKeyInput}
                        setValue={setOpenrouterKeyInput}
                        defaultValue={''}
                        onPersist={setOpenrouterApiKey}
                        validate={(v) => v.trim().length > 0}
                        normalizeOnChange={(s) => s.trim()}
                        invalidMessage="API key cannot be empty"
                        type="password"
                        clearOnEmpty={false}
                        disabled={Boolean(openrouterApiKey)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Use{' '}
                        <a
                          href="https://openrouter.ai"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-muted-foreground hover:text-foreground transition-colors"
                        >
                          OpenRouter
                        </a>{' '}
                        for flexible LLM credits via traditional and crypto
                        payments. It is{' '}
                        <span className="font-medium">
                          strongly recommended
                        </span>{' '}
                        to add a credit limit to this key, as it's stored in
                        your browser.
                      </p>
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="research-model">Model</Label>
                      <div className="relative">
                        <Input
                          id="research-model"
                          type="text"
                          className="text-left"
                          value={modelInput}
                          onChange={(e) => {
                            setModelInput(e.target.value);
                          }}
                          onFocus={() => setIsModelFocused(true)}
                          onBlur={() => {
                            // Delay closing to allow click on suggestion
                            setTimeout(() => setIsModelFocused(false), 120);
                            setResearchAgentModel(modelInput || null);
                          }}
                          autoComplete="off"
                          autoCorrect="off"
                          autoCapitalize="none"
                          spellCheck={false}
                        />
                        {isModelSuggestOpen ? (
                          <div className="absolute z-50 mt-1 w-full bg-popover border border-border rounded-md shadow-md p-0">
                            <Command shouldFilter={false}>
                              <CommandList>
                                {displayModelSuggestions.length === 0 ? (
                                  <CommandEmpty>No suggestions</CommandEmpty>
                                ) : (
                                  <CommandGroup heading="Suggestions">
                                    {displayModelSuggestions.map((m) => (
                                      <CommandItem
                                        key={m}
                                        value={m}
                                        onMouseDown={(e) => e.preventDefault()}
                                        onSelect={() => {
                                          setModelInput(m);
                                          setResearchAgentModel(m);
                                          setIsModelFocused(false);
                                        }}
                                      >
                                        {m}
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                )}
                              </CommandList>
                            </Command>
                          </div>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Choose{' '}
                        <a
                          href="https://openrouter.ai/models"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-muted-foreground hover:text-foreground transition-colors"
                        >
                          a model id
                        </a>{' '}
                        available via OpenRouter.
                      </p>
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="research-system-message">
                        System Message
                      </Label>
                      <Textarea
                        id="research-system-message"
                        value={systemMessageInput}
                        onChange={(e) => setSystemMessageInput(e.target.value)}
                        onBlur={() =>
                          setResearchAgentSystemMessage(
                            systemMessageInput || null
                          )
                        }
                        rows={4}
                      />
                      <p className="text-xs text-muted-foreground">
                        Write instructions for your agent. This is automatically
                        included before every chat with information about the
                        market you're viewing.
                      </p>
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="research-temperature">Temperature</Label>
                      <div className="mt-1 space-y-2.5">
                        <Slider
                          value={[temperatureInput]}
                          onValueChange={(vals) => {
                            const v = Array.isArray(vals) ? vals[0] : 0.7;
                            setTemperatureInput(v);
                          }}
                          onValueCommit={(vals) => {
                            const v = Array.isArray(vals) ? vals[0] : 0.7;
                            setResearchAgentTemperature(v);
                          }}
                          min={0}
                          max={2}
                          step={0.01}
                          className="w-full"
                          id="research-temperature"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Lower is focused. Higher is creative.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
};

export default SettingsPageContent;
