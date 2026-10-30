import { useT } from '../i18n/I18nProvider';

const NPM_URL = 'https://www.npmjs.com/package/@yuhere/js-jsonrpc2/';
const GITHUB_URL = 'https://github.com/yuhere/js-jsonrpc2';

export function Footer() {
    const t = useT();

    return (
        <footer className="footer">
            <span className="footer-version" title={t('footer.version')}>
                v{__APP_VERSION__}
            </span>

            <div className="footer-links">
                <a
                    className="npm-link"
                    href={NPM_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={t('footer.npm')}
                    aria-label={t('footer.npm')}
                >
                    <svg
                        viewBox="0 0 18 7"
                        width="36"
                        height="14"
                        role="img"
                        aria-hidden="true"
                        focusable="false"
                    >
                        <path fill="#CB3837" d="M0 0h18v7H9v-1.5H7.5V7H0z" />
                        <path fill="#fff" d="M1.5 1.5h3v4h-1v-3h-1v3h-1zm4 0h3v4h-1v-3h-1v3h-1zm4 0h4v4h-1v-3h-1v3h-1v-3h-1z" />
                    </svg>
                </a>

                <a
                    className="github-link"
                    href={GITHUB_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={t('footer.github')}
                    aria-label={t('footer.github')}
                >
                    <svg
                        viewBox="0 0 16 16"
                        width="16"
                        height="16"
                        role="img"
                        aria-hidden="true"
                        focusable="false"
                    >
                        <path
                            fill="currentColor"
                            d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"
                        />
                    </svg>
                </a>
            </div>
        </footer>
    );
}