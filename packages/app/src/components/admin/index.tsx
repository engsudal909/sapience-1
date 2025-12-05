'use client';

import { Button } from '@sapience/sdk/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@sapience/sdk/ui/components/ui/dialog';
import { Input } from '@sapience/sdk/ui/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@sapience/sdk/ui/components/ui/select';
import { useToast } from '@sapience/sdk/ui/hooks/use-toast';
import { useResources } from '@sapience/sdk/queries';
import { Plus, Loader2, Upload } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useState } from 'react';

import RFQTab from './RFQTab';
import ReindexPredictionMarketForm from './ReindexPredictionMarketForm';
import { useAdminApi } from '~/hooks/useAdminApi';
import { useSettings } from '~/lib/context/SettingsContext';

// Dynamically import LottieLoader
const LottieLoader = dynamic(() => import('~/components/shared/LottieLoader'), {
  ssr: false,
  loading: () => <div className="w-8 h-8" />,
});

const DEFAULT_ERROR_MESSAGE = 'An error occurred. Please try again.';

const ReindexAccuracyForm = () => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const [address, setAddress] = useState('');
  const [marketId, setMarketId] = useState('');
  const { postJson } = useAdminApi();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      setIsLoading(true);

      await postJson(`/reindex/accuracy`, {
        ...(address && { address }),
        ...(marketId && { marketId }),
      });

      toast({
        title: 'Reindex started',
        description: address
          ? `Accuracy score reindex started for ${address}${marketId ? `, market ${marketId}` : ''}`
          : 'Global accuracy score backfill started',
      });

      setAddress('');
      setMarketId('');
    } catch (error) {
      console.error('Reindex accuracy error:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description:
          error instanceof Error ? error.message : DEFAULT_ERROR_MESSAGE,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="accuracyAddress" className="text-sm font-medium">
          Market Group Address (optional)
        </label>
        <Input
          id="accuracyAddress"
          placeholder="0x... (leave blank for global backfill)"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="accuracyMarketId" className="text-sm font-medium">
          Market ID (optional)
        </label>
        <Input
          id="accuracyMarketId"
          placeholder="e.g. 123 (scoped to address if provided)"
          value={marketId}
          onChange={(e) => setMarketId(e.target.value)}
        />
      </div>

      <Button type="submit" disabled={isLoading}>
        {isLoading ? (
          <>
            <LottieLoader width={16} height={16} />
            <span className="ml-2">Processing...</span>
          </>
        ) : (
          'Reindex Accuracy Scores'
        )}
      </Button>
    </form>
  );
};

const IndexResourceForm = () => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { data: resourcesData } = useResources();
  const [selectedResource, setSelectedResource] = useState('');
  const [startTimestamp, setStartTimestamp] = useState('');
  const [endTimestamp, setEndTimestamp] = useState('');
  const { postJson: postJson3 } = useAdminApi();

  const handleIndexResource = async () => {
    try {
      setIsLoading(true);
      const response = await postJson3<{ success: boolean; error?: string }>(
        `/reindex/resource`,
        {
          slug: selectedResource,
          startTimestamp,
          ...(endTimestamp && { endTimestamp }),
        }
      );
      if (response.success) {
        toast({
          title: 'Indexing complete',
          description: 'Resource has been reindexed successfully',
          variant: 'default',
        });
      } else {
        toast({
          title: 'Indexing failed',
          description: response.error,
          variant: 'destructive',
        });
      }
    } catch (e: unknown) {
      console.error('Error in handleIndexResource:', e);
      toast({
        title: 'Indexing failed',
        description: (e as Error)?.message || DEFAULT_ERROR_MESSAGE,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <span className="text-sm font-medium">Resource</span>
        <Select value={selectedResource} onValueChange={setSelectedResource}>
          <SelectTrigger>
            <SelectValue placeholder="Select a resource" />
          </SelectTrigger>
          <SelectContent>
            {resourcesData?.map((resource: { slug: string; name: string }) => (
              <SelectItem key={resource.slug} value={resource.slug}>
                {resource.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <span className="text-sm font-medium">Start Timestamp</span>
        <Input
          type="number"
          value={startTimestamp}
          onChange={(e) => setStartTimestamp(e.target.value)}
          placeholder="Enter Unix timestamp"
        />
        <p className="text-sm text-muted-foreground">
          <a
            href="https://www.unixtimestamp.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Unix seconds
          </a>
          , 10 digits
        </p>
      </div>

      <div className="space-y-2">
        <span className="text-sm font-medium">End Timestamp (Optional)</span>
        <Input
          type="number"
          value={endTimestamp}
          onChange={(e) => setEndTimestamp(e.target.value)}
          placeholder="Enter Unix timestamp"
        />
        <p className="text-sm text-muted-foreground">
          <a
            href="https://www.unixtimestamp.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Unix seconds
          </a>
          , 10 digits
        </p>
      </div>

      <Button
        onClick={handleIndexResource}
        disabled={!selectedResource || !startTimestamp || isLoading}
        className="w-full"
      >
        {isLoading ? (
          <div className="animate-spin">
            <Loader2 className="w-4 h-4" />
          </div>
        ) : (
          'Submit'
        )}
      </Button>
    </div>
  );
};

const RefreshCacheForm = () => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { data: resourcesData } = useResources();
  const [refreshResourceSlug, setRefreshResourceSlug] = useState('all');
  const { getJson } = useAdminApi();

  const handleRefreshCache = async () => {
    try {
      setIsLoading(true);
      const response = await (refreshResourceSlug &&
      refreshResourceSlug !== 'all'
        ? getJson<{ success: boolean; message?: string; error?: string }>(
            `/cache/refresh-candle-cache/${refreshResourceSlug}`
          )
        : getJson<{ success: boolean; message?: string; error?: string }>(
            `/cache/refresh-candle-cache`
          ));

      if (response && response.success) {
        toast({
          title: 'Cache refreshed',
          description:
            refreshResourceSlug && refreshResourceSlug !== 'all'
              ? `Cache for ${refreshResourceSlug} has been successfully refreshed`
              : 'Cache has been successfully refreshed for all resources',
          variant: 'default',
        });
        setRefreshResourceSlug('all'); // Reset to "all" instead of empty string
      } else {
        toast({
          title: 'Cache refresh failed',
          description: response.error || DEFAULT_ERROR_MESSAGE,
          variant: 'destructive',
        });
      }
    } catch (e: unknown) {
      console.error('Error in handleRefreshCache:', e);
      toast({
        title: 'Cache refresh failed',
        description: (e as Error)?.message || DEFAULT_ERROR_MESSAGE,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm">
        This will trigger a hard initialization of the cache. This operation
        requires authentication.
      </p>

      <div className="space-y-2">
        <span className="text-sm font-medium">Resource (Optional)</span>
        <Select
          value={refreshResourceSlug}
          onValueChange={setRefreshResourceSlug}
        >
          <SelectTrigger>
            <SelectValue placeholder="All resources (default)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All resources</SelectItem>
            {resourcesData?.map((resource: { slug: string; name: string }) => (
              <SelectItem key={resource.slug} value={resource.slug}>
                {resource.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Select a specific resource to refresh, or leave empty to refresh all
          resources.
        </p>
      </div>

      <Button
        onClick={handleRefreshCache}
        disabled={isLoading}
        className="w-full"
      >
        {isLoading ? (
          <div className="animate-spin">
            <Loader2 className="w-4 h-4" />
          </div>
        ) : (
          'Refresh Cache'
        )}
      </Button>
    </div>
  );
};

const Admin = () => {
  const [indexResourceOpen, setIndexResourceOpen] = useState(false);
  const [refreshCacheOpen, setRefreshCacheOpen] = useState(false);
  const [accuracyReindexOpen, setAccuracyReindexOpen] = useState(false);
  const [createConditionOpen, setCreateConditionOpen] = useState(false);
  const [rfqCsvImportOpen, setRfqCsvImportOpen] = useState(false);
  const [predictionMarketReindexOpen, setPredictionMarketReindexOpen] =
    useState(false);
  const { adminBaseUrl, setAdminBaseUrl, defaults } = useSettings();
  const [adminDialogOpen, setAdminDialogOpen] = useState(false);
  const [adminDraft, setAdminDraft] = useState(
    adminBaseUrl ?? defaults.adminBaseUrl
  );
  const [adminError, setAdminError] = useState<string | null>(null);

  const isHttpUrl = (value: string) => {
    try {
      const u = new URL(value);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
      return false;
    }
  };

  // Note: Market groups are fetched here for potential future use

  return (
    <div className="container pt-24 mx-auto px-6 pb-6">
      <header className="flex items-center justify-between mb-8">
        <h1 className="text-3xl">Control Center</h1>
        <div className="flex items-center space-x-4">
          <Dialog open={indexResourceOpen} onOpenChange={setIndexResourceOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                Index Resource
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Index Resource</DialogTitle>
              </DialogHeader>
              <IndexResourceForm />
            </DialogContent>
          </Dialog>
          <Dialog
            open={accuracyReindexOpen}
            onOpenChange={setAccuracyReindexOpen}
          >
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                Reindex Accuracy Scores
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Reindex Accuracy Scores</DialogTitle>
              </DialogHeader>
              <ReindexAccuracyForm />
            </DialogContent>
          </Dialog>
          <Dialog
            open={predictionMarketReindexOpen}
            onOpenChange={setPredictionMarketReindexOpen}
          >
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                Reindex Prediction Markets
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Reindex Prediction Markets</DialogTitle>
              </DialogHeader>
              <ReindexPredictionMarketForm />
            </DialogContent>
          </Dialog>
          <Dialog open={refreshCacheOpen} onOpenChange={setRefreshCacheOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                Refresh Cache
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Refresh Cache</DialogTitle>
              </DialogHeader>
              <RefreshCacheForm />
            </DialogContent>
          </Dialog>
          <Dialog open={adminDialogOpen} onOpenChange={setAdminDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                Endpoint Settings
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Endpoint Settings</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <label htmlFor="admin-endpoint" className="text-sm font-medium">
                  Base URL
                </label>
                <Input
                  id="admin-endpoint"
                  value={adminDraft}
                  onChange={(e) => {
                    const v = e.target.value;
                    setAdminDraft(v);
                    setAdminError(
                      v && !isHttpUrl(v)
                        ? 'Must be an absolute http(s) base URL'
                        : null
                    );
                  }}
                  onBlur={() => {
                    if (!adminDraft) {
                      setAdminBaseUrl(null);
                      setAdminDraft(defaults.adminBaseUrl);
                      setAdminError(null);
                      return;
                    }
                    if (isHttpUrl(adminDraft)) {
                      const normalized =
                        adminDraft.endsWith('/') && adminDraft !== '/'
                          ? adminDraft.slice(0, -1)
                          : adminDraft;
                      setAdminDraft(normalized);
                      setAdminBaseUrl(normalized);
                      setAdminError(null);
                    } else {
                      setAdminError('Must be an absolute http(s) base URL');
                    }
                  }}
                />
                {adminError ? (
                  <p className="text-xs text-red-500">{adminError}</p>
                ) : null}
                <div className="flex gap-2 justify-end">
                  {adminDraft !== defaults.adminBaseUrl ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setAdminBaseUrl(null);
                        setAdminDraft(defaults.adminBaseUrl);
                        setAdminError(null);
                      }}
                    >
                      Reset
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setAdminDialogOpen(false)}
                  >
                    Close
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </header>
      <RFQTab
        createOpen={createConditionOpen}
        setCreateOpen={setCreateConditionOpen}
        csvImportOpen={rfqCsvImportOpen}
        onCsvImportOpenChange={setRfqCsvImportOpen}
        actionButtons={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRfqCsvImportOpen(true)}
            >
              <Upload className="mr-1 h-4 w-4" />
              Import CSV
            </Button>
            <Button size="sm" onClick={() => setCreateConditionOpen(true)}>
              <Plus className="mr-1 h-4 w-4" />
              New Condition
            </Button>
          </>
        }
      />
    </div>
  );
};

export default Admin;
