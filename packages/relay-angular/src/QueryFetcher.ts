import { Disposable, CacheConfig, IEnvironment, Snapshot, __internal, OperationType } from 'relay-runtime';
import { FetchPolicy, RenderProps } from './RelayHooksType';
import { isNetworkPolicy, isStorePolicy } from './Utils';

const { fetchQuery } = __internal;

const defaultPolicy = 'store-or-network';

const cache: Map<string, QueryFetcher<any>> = new Map();

const DATA_RETENTION_TIMEOUT = 30 * 1000;

export class QueryFetcher<TOperationType extends OperationType = OperationType> {
    environment: IEnvironment;
    query: any;
    networkSubscription: Disposable | null;
    rootSubscription: Disposable | null;
    error: Error | null;
    snapshot: Snapshot;
    fetchPolicy: FetchPolicy;
    fetchKey: string | number;
    disposableRetain: Disposable;
    forceUpdate: (_o: any) => void;
    suspense: boolean;
    releaseQueryTimeout;
    indexUpdate = 0;

    constructor(forceUpdate = (): void => undefined, suspense = false) {
        this.suspense = suspense;
        this.setForceUpdate(forceUpdate);
    }

    setForceUpdate(forceUpdate: () => void): void {
        this.forceUpdate = forceUpdate;
    }

    refreshHooks(): void {
        if (this.forceUpdate) {
            this.indexUpdate += 1;
            this.forceUpdate(this.indexUpdate);
        }
    }

    dispose(): void {
        this.disposeRequest();
        this.disposeRetain();
    }

    disposeRetain(): void {
        this.clearTemporaryRetain();
        this.disposableRetain && this.disposableRetain.dispose();
        this.query && cache.delete(this.query.request.identifier);
    }

    clearTemporaryRetain(): void {
        clearTimeout(this.releaseQueryTimeout);
        this.releaseQueryTimeout = null;
    }

    temporaryRetain(): void {
        const localReleaseTemporaryRetain = (): void => {
            this.dispose();
        };
        this.releaseQueryTimeout = setTimeout(localReleaseTemporaryRetain, DATA_RETENTION_TIMEOUT);
    }

    isDiffEnvQuery(environment: IEnvironment, query): boolean {
        return environment !== this.environment || query.request.identifier !== this.query.request.identifier;
    }

    lookupInStore(environment: IEnvironment, operation, fetchPolicy: FetchPolicy): Snapshot | null {
        if (isStorePolicy(fetchPolicy)) {
            const check: any = environment.check(operation);
            if (check === 'available' || check.status === 'available') {
                return environment.lookup(operation.fragment);
            }
        }
        return null;
    }

    execute(
        environment: IEnvironment,
        query,
        options,
        retain: (environment, query) => Disposable = (environment, query): Disposable => environment.retain(query),
    ): RenderProps<TOperationType> {
        const { fetchPolicy = defaultPolicy, networkCacheConfig, fetchKey, skip } = options;
        let storeSnapshot;
        const retry = (cacheConfigOverride: CacheConfig = networkCacheConfig): void => {
            this.disposeRequest();
            this.fetch(cacheConfigOverride, false);
        };
        this.clearTemporaryRetain();

        if (skip) {
            return {
                cached: false,
                retry,
                error: null,
                props: undefined,
            };
        }
        const isDiffEnvQuery = this.isDiffEnvQuery(environment, query);
        if (isDiffEnvQuery || fetchPolicy !== this.fetchPolicy || fetchKey !== this.fetchKey) {
            if (isDiffEnvQuery) {
                this.disposeRetain();
                this.suspense && cache.set(query.request.identifier, this);
                this.disposableRetain = retain(environment, query);
            }
            this.environment = environment;
            this.query = query;
            this.fetchPolicy = fetchPolicy;
            this.fetchKey = fetchKey;
            this.disposeRequest();

            storeSnapshot = this.lookupInStore(environment, this.query, fetchPolicy);
            const isNetwork = isNetworkPolicy(fetchPolicy, storeSnapshot);
            if (isNetwork) {
                this.fetch(networkCacheConfig, this.suspense && !storeSnapshot);
            } else if (!!storeSnapshot) {
                this.snapshot = storeSnapshot;
                this.error = null;
                this.subscribe(storeSnapshot);
            }
        }
        const resultSnapshot = storeSnapshot || this.snapshot;
        return {
            cached: !!storeSnapshot,
            retry,
            error: this.error,
            props: resultSnapshot ? resultSnapshot.data : null,
        };
    }

    subscribe(snapshot): void {
        if (this.rootSubscription) {
            this.rootSubscription.dispose();
        }
        this.rootSubscription = this.environment.subscribe(snapshot, (snapshot) => {
            // Read from this._fetchOptions in case onDataChange() was lazily added.
            this.snapshot = snapshot;
            this.error = null;
            this.forceUpdate(snapshot);
        });
    }

    fetch(networkCacheConfig, suspense: boolean): void {
        let fetchHasReturned = false;
        let resolveNetworkPromise = (): void => undefined;
        fetchQuery(this.environment, this.query, {
            networkCacheConfig: suspense && !networkCacheConfig ? { force: true } : networkCacheConfig,
        }).subscribe({
            start: (subscription) => {
                this.networkSubscription = {
                    dispose: (): void => subscription.unsubscribe(),
                };
            },
            next: () => {
                this._onQueryDataAvailable({ notifyFirstResult: fetchHasReturned, suspense });
                resolveNetworkPromise();
            },
            error: (error) => {
                this.error = error;
                (this.snapshot as any) = null;
                if (fetchHasReturned && !suspense) {
                    this.forceUpdate(error);
                }
                this.error = error;
                resolveNetworkPromise();
                this.networkSubscription = null;
            },
            complete: () => {
                this.networkSubscription = null;
            },
            unsubscribe: () => {
                if (suspense && !this.rootSubscription && this.releaseQueryTimeout) {
                    this.dispose();
                }
            },
        });
        fetchHasReturned = true;
        if (suspense) {
            this.setForceUpdate(() => undefined);
            this.temporaryRetain();
            throw new Promise((resolve) => {
                resolveNetworkPromise = resolve;
            });
        }
    }

    disposeRequest(): void {
        this.error = null;
        (this.snapshot as any) = null;
        if (this.networkSubscription) {
            this.networkSubscription.dispose();
            this.networkSubscription = null;
        }
        if (this.rootSubscription) {
            this.rootSubscription.dispose();
            this.rootSubscription = null;
        }
    }

    _onQueryDataAvailable({ notifyFirstResult, suspense }): void {
        // `_onQueryDataAvailable` can be called synchronously the first time and can be called
        // multiple times by network layers that support data subscriptions.
        // Wait until the first payload to call `onDataChange` and subscribe for data updates.
        if (this.snapshot) {
            return;
        }

        this.snapshot = this.environment.lookup(this.query.fragment);

        // Subscribe to changes in the data of the root fragment
        this.subscribe(this.snapshot);

        if (this.snapshot && notifyFirstResult && !suspense) {
            this.error = null;
            this.forceUpdate(this.snapshot);
        }
    }
}
