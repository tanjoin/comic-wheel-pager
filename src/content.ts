type ContentWindow = Window & {
    _myOriginalScriptBookmarklet?: boolean;
    _viewerWheelHandlerInstalled?: boolean;
    _comicFuzWheelHandlerInstalled?: boolean;
};

const SELECTOR_SECTION = "section";
const SELECTOR_SPLIDE_LIST = ".splide__list";
const SELECTOR_XCV_MAIN = "#xCVHMain";

const COMIC_WALKER_CLICK_X_FORWARD = 3671;
const COMIC_WALKER_CLICK_X_BACK = 5;

class Content {
    private readonly windowState: ContentWindow;
    private readonly hostname: string;
    private domains: string[] = [];
    private invertWheel = false;
    private lastWheelTime = 0;
    private static readonly WHEEL_DEBOUNCE_TIME = 150;

    constructor() {
        this.windowState = window as ContentWindow;
        this.hostname = location.hostname;
    }

    async load() {
        if (this.windowState._myOriginalScriptBookmarklet) {
            return;
        }
        this.windowState._myOriginalScriptBookmarklet = true;

        const data = await chrome.storage.local.get(['domains', 'invertWheel']);
        this.domains = this.normalizeDomains(data.domains as string[] | undefined);
        this.invertWheel = Boolean(data.invertWheel);

        if (!this.isAllowedByDomain()) {
            return;
        }

        this.apply();
    }

    private apply() {
        if (this.isComicFuzHost()) {
            this.installComicFuzWheelHandler();
            return;
        }

        if (this.isPageNavHost()) {
            this.installSectionWheelHandler(".page-navigation-forward", ".page-navigation-backward");
            return;
        }

        if (this.isComicWalkerHost()) {
            this.installComicWalkerWheelHandler();
            return;
        }

        if (this.isPocketMagazineHost()) {
            this.installSectionWheelHandler(".c-viewer__pager-next", ".c-viewer__pager-prev");
            return;
        }

        if (this.isXcvHost()) {
            this.installElementWheelHandler(SELECTOR_XCV_MAIN, "#xCVLeftNav", "#xCVRightNav");
        }
    }

    private normalizeDomains(domains: string[] | undefined): string[] {
        return (domains || [])
            .map((domain) => domain.trim())
            .filter((domain) => domain.length > 0);
    }

    private isAllowedByDomain(): boolean {
        return this.domains.some((domain) => this.hostname.includes(domain));
    }

    private isPageNavHost(): boolean {
        return ["comic-gardo.com", "comic-action.com", "comic-earthstar.com", "shonenjumpplus.com"].some(
            (host) => this.hostname.includes(host),
        );
    }

    private isComicFuzHost(): boolean {
        return this.hostname.includes("comic-fuz.com") && location.pathname.includes("/manga/viewer/");
    }

    private isComicWalkerHost(): boolean {
        return this.hostname.includes("comic-walker.com");
    }

    private isPocketMagazineHost(): boolean {
        return this.hostname.includes("pocket.shonenmagazine.com");
    }

    private isXcvHost(): boolean {
        return ["youngchampion.jp", "championcross.jp", "comic-medu.com", "g-comi.jp"].some((host) =>
            this.hostname.includes(host),
        );
    }

    private installSectionWheelHandler(nextSelector: string, prevSelector: string) {
        this.installElementWheelHandler(SELECTOR_SECTION, nextSelector, prevSelector);
    }

    private async installElementWheelHandler(elementSelector: string, nextSelector: string, prevSelector: string) {
        let elements = document.querySelectorAll(elementSelector);
        // 要素が取得できなかったら何回か時間を空けてリトライする
        let retryCount = 0;
        const maxRetries = 5;
        const retryInterval = 1000; // 1秒
        while (elements.length === 0 && retryCount < maxRetries) {
            console.log(`Waiting for elements to appear: ${elementSelector}, retry ${retryCount + 1}/${maxRetries}`);
            await new Promise((resolve) => setTimeout(resolve, retryInterval));
            elements = document.querySelectorAll(elementSelector);
            retryCount++;
        }

        elements.forEach((element) => {
            element.addEventListener(
                "mousewheel",
                (event: Event) => {
                    const wheelEvent = event as WheelEvent;
                    const deltaY = this.normalizeWheelDelta(wheelEvent.deltaY);
                    event.preventDefault();
                    if (deltaY > 0) {
                        document.querySelector<HTMLElement>(nextSelector)?.click();
                    } else if (deltaY < 0) {
                        document.querySelector<HTMLElement>(prevSelector)?.click();
                    }
                },
                { passive: false },
            );
        });
    }

    private async installComicWalkerWheelHandler() {
        if (this.windowState._viewerWheelHandlerInstalled) {
            return;
        }
        this.windowState._viewerWheelHandlerInstalled = true;

        let viewerTargetElement = document.querySelector(SELECTOR_SPLIDE_LIST);

        // 要素が取得できなかったら何回か時間を空けてリトライする
        let retryCount = 0;
        const maxRetries = 5;
        const retryInterval = 1000; // 1秒
        while (!viewerTargetElement && retryCount < maxRetries) {
            console.log(`Waiting for viewer target element to appear, retry ${retryCount + 1}/${maxRetries}`);
            await new Promise((resolve) => setTimeout(resolve, retryInterval));
            viewerTargetElement = document.querySelector(SELECTOR_SPLIDE_LIST);
            retryCount++;
        }

        if (!viewerTargetElement) {
            return;
        }

        document.body.addEventListener("wheel", (event) => this.handleComicWalkerWheel(event), {
            passive: false,
            capture: true,
        });
    }

    private installComicFuzWheelHandler() {
        if (this.windowState._comicFuzWheelHandlerInstalled) {
            return;
        }
        this.windowState._comicFuzWheelHandlerInstalled = true;

        document.addEventListener("wheel", (event) => this.handleComicFuzWheel(event), {
            passive: false,
            capture: true,
        });
    }

    private handleComicFuzWheel(event: WheelEvent) {
        const now = Date.now();
        if (now - this.lastWheelTime < Content.WHEEL_DEBOUNCE_TIME) {
            event.preventDefault();
            return;
        }

        if (event.deltaY === 0) {
            return;
        }

        this.lastWheelTime = now;
        event.preventDefault();

        const deltaY = this.normalizeWheelDelta(event.deltaY);
        const key = deltaY > 0 ? "ArrowLeft" : "ArrowRight";
        this.dispatchArrowKey(key);
    }

    private handleComicWalkerWheel(event: WheelEvent) {
        const now = Date.now();
        if (now - this.lastWheelTime < Content.WHEEL_DEBOUNCE_TIME) {
            event.preventDefault();
            return;
        }
        this.lastWheelTime = now;

        const currentViewerTargetElement = document.querySelector(SELECTOR_SPLIDE_LIST);
        if (!currentViewerTargetElement) {
            event.preventDefault();
            return;
        }

        const rect = currentViewerTargetElement.getBoundingClientRect();
        const clickYMiddle = rect.top + rect.height / 2;
        const delta = Math.sign(this.normalizeWheelDelta(event.deltaY));

        if (delta < 0) {
            event.preventDefault();
            this.dispatchClickEvent(currentViewerTargetElement, COMIC_WALKER_CLICK_X_FORWARD, clickYMiddle);
        } else if (delta > 0) {
            event.preventDefault();
            this.dispatchClickEvent(currentViewerTargetElement, COMIC_WALKER_CLICK_X_BACK, clickYMiddle);
        }
    }

    private dispatchClickEvent(targetElement: Element, clientX: number, clientY: number) {
        const clickEvent = new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            view: window,
            button: 0,
            buttons: 1,
            clientX,
            clientY,
            screenX: clientX,
            screenY: clientY,
        });
        targetElement.dispatchEvent(clickEvent);
    }

    private dispatchArrowKey(key: "ArrowLeft" | "ArrowRight") {
        const keyboardEventInit: KeyboardEventInit = {
            key,
            code: key,
            bubbles: true,
            cancelable: true,
        };
        document.dispatchEvent(new KeyboardEvent("keydown", keyboardEventInit));
        document.dispatchEvent(new KeyboardEvent("keyup", keyboardEventInit));
    }

    private normalizeWheelDelta(deltaY: number): number {
        return this.invertWheel ? -deltaY : deltaY;
    }
}

window.onload = async () => {
    const content = new Content();
    await content.load();
};
