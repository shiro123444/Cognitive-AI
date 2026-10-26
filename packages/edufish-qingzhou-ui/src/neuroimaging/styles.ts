import { createStaticStyles } from 'antd-style';

/**
 * Locally scoped structural styles. Every color, spacing, radius and type size
 * comes from host semantic tokens, so the viewer follows the surrounding
 * Qingzhou theme in light and dark modes.
 */
export const styles = createStaticStyles(({ css, cssVar }) => ({
  root: css`
    display: flex;
    flex-direction: column;
    gap: ${cssVar.marginSM};
    min-width: 0;
    color: ${cssVar.colorText};
    font-family: ${cssVar.fontFamily};
    font-size: ${cssVar.fontSize};
    line-height: ${cssVar.lineHeight};
  `,
  header: css`
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: ${cssVar.marginSM};
    min-width: 0;
  `,
  title: css`
    margin: 0;
    font-size: ${cssVar.fontSizeLG};
    font-weight: 600;
    line-height: ${cssVar.lineHeight};
    overflow-wrap: anywhere;
  `,
  muted: css`
    margin: 0;
    color: ${cssVar.colorTextSecondary};
    font-size: ${cssVar.fontSizeSM};
    overflow-wrap: anywhere;
  `,
  tagRow: css`
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: ${cssVar.marginXS};
  `,
  toolbar: css`
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: ${cssVar.marginXS} ${cssVar.marginSM};
    min-width: 0;
    padding: ${cssVar.paddingXS} ${cssVar.paddingSM};
    background: ${cssVar.colorFillQuaternary};
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusLG};
  `,
  opacityGroup: css`
    display: flex;
    align-items: center;
    gap: ${cssVar.marginXS};
    min-width: 0;
    color: ${cssVar.colorTextSecondary};
    font-size: ${cssVar.fontSizeSM};
  `,
  opacitySlider: css`
    width: 120px;
    min-width: 96px;
  `,
  viewport: css`
    position: relative;
    width: 100%;
    height: clamp(320px, 55vh, 560px);
    min-height: 320px;
    overflow: hidden;
    background: ${cssVar.colorBgContainer};
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusLG};
  `,
  canvas: css`
    display: block;
    width: 100%;
    height: 100%;
    outline: none;
    touch-action: none;

    &:focus-visible {
      outline: 2px solid ${cssVar.colorPrimary};
      outline-offset: -2px;
    }
  `,
  overlay: css`
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: ${cssVar.marginSM};
    padding: ${cssVar.padding};
    background: ${cssVar.colorBgContainer};
    color: ${cssVar.colorTextSecondary};
    font-size: ${cssVar.fontSize};
    text-align: center;
  `,
  overlayPanel: css`
    width: min(100%, 520px);
  `,
  overlayText: css`
    max-width: 520px;
    color: ${cssVar.colorTextSecondary};
    overflow-wrap: anywhere;
  `,
  status: css`
    margin: 0;
    min-height: ${cssVar.controlHeight};
    color: ${cssVar.colorTextSecondary};
    font-size: ${cssVar.fontSizeSM};
    overflow-wrap: anywhere;
  `,
  summary: css`
    display: flex;
    flex-direction: column;
    gap: ${cssVar.marginXS};
    padding: ${cssVar.paddingSM};
    background: ${cssVar.colorFillQuaternary};
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusLG};
  `,
  summaryBody: css`
    margin: 0;
    color: ${cssVar.colorText};
    font-size: ${cssVar.fontSizeSM};
    overflow-wrap: anywhere;
  `,
}));
