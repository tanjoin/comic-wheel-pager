class Options {

    private _textArea: HTMLTextAreaElement | null;

    constructor() {
        this._textArea = document.getElementById('domains') as (HTMLTextAreaElement | null);
        this._textArea?.addEventListener('change', this.save.bind(this));
    }

    async save() {
        const value = this._textArea?.value;
        const domains = (value || '')
            .split('\n')
            .map((domain) => domain.trim())
            .filter((domain) => domain.length > 0);
        await chrome.storage.local.set({ 'domains': domains });
    }

    async load() {
        const data = await chrome.storage.local.get('domains');
        this.render(Array.isArray(data.domains) ? data.domains : []);
    }

    async render(array: string[]) {
        if (!this._textArea) {
            return;
        }
        this._textArea.value = array?.join('\n') || '';
    }
};

window.onload = async () => {
    const options = new Options();
    await options.load();
};
