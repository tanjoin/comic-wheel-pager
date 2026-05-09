const DEFAULT_DOMAINS: string[] = [
    'comic-fuz.com',
    'comic-gardo.com',
    'comic-action.com',
    'comic-earthstar.com',
    'shonenjumpplus.com',
    'comic-walker.com',
    'pocket.shonenmagazine.com',
    'youngchampion.jp',
    'championcross.jp',
    'comic-medu.com',
];

class Background {

    constructor() {
        chrome.runtime.onInstalled.addListener(() => {
            void this.initializeState();
        });

        chrome.runtime.onStartup.addListener(() => {
            void this.initializeState();
        });

        void this.initializeState();

        chrome.tabs.onActivated.addListener(({ tabId }) => {
            void this.updateBadgeForTabId(tabId);
        });

        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            if (changeInfo.status === 'complete' || typeof changeInfo.url === 'string') {
                void this.updateBadge(tabId, tab);
            }
        });

        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName === 'local' && changes.domains) {
                void this.updateBadgeForAllTabs();
            }
        });

        chrome.action.onClicked.addListener((tab) => {
            void this.toggleCurrentSite(tab);
        });
    }

    private async initializeState() {
        await this.ensureDefaultDomains();
        await this.updateBadgeForAllTabs();
    }

    private async ensureDefaultDomains() {
        const data = await chrome.storage.local.get('domains');
        if (Array.isArray(data.domains)) {
            return;
        }
        await chrome.storage.local.set({ domains: DEFAULT_DOMAINS });
    }

    private normalizeDomains(value: unknown): string[] {
        if (!Array.isArray(value)) {
            return [];
        }
        return value
            .filter((domain): domain is string => typeof domain === 'string')
            .map((domain) => domain.trim())
            .filter((domain) => domain.length > 0);
    }

    private getHostnameFromTab(tab: chrome.tabs.Tab): string | null {
        if (!tab.url) {
            return null;
        }
        try {
            return new URL(tab.url).hostname;
        } catch {
            return null;
        }
    }

    private isEnabledHost(hostname: string, domains: string[]): boolean {
        return domains.some((domain) => hostname.includes(domain));
    }

    private async updateBadgeForAllTabs() {
        const tabs = await chrome.tabs.query({});
        await Promise.all(
            tabs
                .filter((tab) => tab.id !== undefined)
                .map((tab) => this.updateBadge(tab.id as number, tab)),
        );
    }

    private async updateBadgeForTabId(tabId: number) {
        const tab = await chrome.tabs.get(tabId);
        await this.updateBadge(tabId, tab);
    }

    private async updateBadge(tabId: number, tab: chrome.tabs.Tab) {
        const hostname = this.getHostnameFromTab(tab);
        if (!hostname) {
            await chrome.action.setBadgeText({ tabId, text: '' });
            return;
        }

        const data = await chrome.storage.local.get('domains');
        const domains = this.normalizeDomains(data.domains);
        const enabled = this.isEnabledHost(hostname, domains);

        await chrome.action.setBadgeBackgroundColor({
            tabId,
            color: enabled ? '#188038' : '#9AA0A6',
        });
        await chrome.action.setBadgeText({ tabId, text: enabled ? 'ON' : 'OFF' });
    }

    private async toggleCurrentSite(tab: chrome.tabs.Tab) {
        const tabId = tab.id;
        const hostname = this.getHostnameFromTab(tab);
        if (tabId === undefined || !hostname) {
            return;
        }

        const data = await chrome.storage.local.get('domains');
        const domains = this.normalizeDomains(data.domains);
        const matchedDomains = domains.filter((domain) => hostname.includes(domain));

        let nextDomains: string[];
        if (matchedDomains.length > 0) {
            nextDomains = domains.filter((domain) => !hostname.includes(domain));
        } else {
            nextDomains = [...domains, hostname];
        }

        await chrome.storage.local.set({ domains: nextDomains });
        await this.updateBadge(tabId, tab);
        await chrome.tabs.reload(tabId);
    }
}

new Background();
