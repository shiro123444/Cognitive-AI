import { ConfigProvider, ThemeProvider } from '@lobehub/ui';
import { I18nextProvider } from 'react-i18next';

/**
 * Host-provider composition for the preview only.
 *
 * The production adapter never creates these providers. Keeping the exact
 * same host libraries here is what makes token, appearance and locale
 * inheritance observable in the browser checks. Qingzhou lets Lobe's theme
 * provider configure Ant Design; do not add a competing Ant Design provider.
 */
export function HostProviders({ children, i18n, primaryColor, themeMode }) {
  return (
    <I18nextProvider i18n={i18n}>
      <ThemeProvider
        appearance={themeMode}
        defaultAppearance={themeMode}
        defaultThemeMode={themeMode}
        enableCustomFonts={false}
        customTheme={{ primaryColor }}
        theme={{ cssVar: { key: 'lobe-vars' } }}
      >
        <ConfigProvider locale={i18n.language.startsWith('zh') ? 'zh-CN' : 'en-US'}>
          {children}
        </ConfigProvider>
      </ThemeProvider>
    </I18nextProvider>
  );
}
