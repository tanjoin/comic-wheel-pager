class Options {

    private _textArea: HTMLTextAreaElement | null;
    private _invertWheel: HTMLInputElement | null;

    constructor() {
        this._textArea = document.getElementById('domains') as (HTMLTextAreaElement | null);
        this._invertWheel = document.getElementById('invertWheel') as (HTMLInputElement | null);
        this._textArea?.addEventListener('change', this.save.bind(this));
        this._invertWheel?.addEventListener('change', this.save.bind(this));
    }

    async save() {
        const value = this._textArea?.value;
        const domains = (value || '')
            .split('\n')
            .map((domain) => domain.trim())
            .filter((domain) => domain.length > 0);
        const invertWheel = this._invertWheel?.checked || false;
        await chrome.storage.local.set({ domains, invertWheel });
    }

    async load() {
        const data = await chrome.storage.local.get(['domains', 'invertWheel']);
        this.render(Array.isArray(data.domains) ? data.domains : [], Boolean(data.invertWheel));
    }

    async render(array: string[], invertWheel: boolean) {
        if (!this._textArea || !this._invertWheel) {
            return;
        }
        this._textArea.value = array?.join('\n') || '';
        this._invertWheel.checked = invertWheel;
    }
};

window.onload = async () => {
    const options = new Options();
    await options.load();
};
