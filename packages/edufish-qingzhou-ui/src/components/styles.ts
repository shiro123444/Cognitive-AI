import { createStaticStyles } from 'antd-style';

/**
 * Locally scoped structural styles only. All colors, spacing, radii and type
 * sizes come from the host's semantic tokens, so the components follow the
 * surrounding Qingzhou theme in both light and dark modes.
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
  subtitle: css`
    margin: 0 0 ${cssVar.marginXS};
    font-size: ${cssVar.fontSize};
    font-weight: 600;
    overflow-wrap: anywhere;
  `,
  muted: css`
    color: ${cssVar.colorTextSecondary};
    font-size: ${cssVar.fontSizeSM};
    overflow-wrap: anywhere;
  `,
  body: css`
    margin: 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  `,
  card: css`
    display: flex;
    flex-direction: column;
    gap: ${cssVar.marginXS};
    min-width: 0;
    padding: ${cssVar.paddingSM};
    background: ${cssVar.colorBgContainer};
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusLG};
  `,
  list: css`
    display: flex;
    flex-direction: column;
    gap: ${cssVar.marginXS};
    margin: 0;
    padding: 0;
    list-style: none;
  `,
  numberedList: css`
    display: flex;
    flex-direction: column;
    gap: ${cssVar.marginXS};
    margin: 0;
    padding-inline-start: ${cssVar.padding};
  `,
  listItem: css`
    min-width: 0;
    overflow-wrap: anywhere;
  `,
  row: css`
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: ${cssVar.marginXS};
    min-width: 0;
  `,
  tagRow: css`
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: ${cssVar.marginXS};
  `,
  scrollList: css`
    display: flex;
    flex-direction: column;
    gap: ${cssVar.marginXS};
    max-height: 280px;
    margin: 0;
    padding: 0;
    overflow: auto;
    list-style: none;
  `,
  code: css`
    padding: 0 ${cssVar.paddingXXS};
    font-family: ${cssVar.fontFamilyCode};
    background: ${cssVar.colorFillQuaternary};
    border-radius: ${cssVar.borderRadiusSM};
    overflow-wrap: anywhere;
  `,
  graphSvg: css`
    display: block;
    width: 100%;
    height: auto;
    max-height: 360px;
    background: ${cssVar.colorFillQuaternary};
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusLG};
  `,
  edge: css`
    stroke: ${cssVar.colorBorderSecondary};
    stroke-width: 1.5;
  `,
  edgeActive: css`
    stroke: ${cssVar.colorPrimary};
    stroke-width: 2;
  `,
  node: css`
    fill: ${cssVar.colorBgContainer};
    stroke: ${cssVar.colorBorder};
    stroke-width: 1.5;
  `,
  nodeSelected: css`
    fill: ${cssVar.colorPrimaryBg};
    stroke: ${cssVar.colorPrimary};
    stroke-width: 2.5;
  `,
  nodeLabel: css`
    fill: ${cssVar.colorText};
    font-family: ${cssVar.fontFamily};
    font-size: 11px;
    pointer-events: none;
  `,
  nodeLabelSelected: css`
    fill: ${cssVar.colorPrimaryText};
    font-weight: 600;
  `,
  formItem: css`
    margin-bottom: ${cssVar.marginSM};
  `,
  actions: css`
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: ${cssVar.marginXS};
  `,
  fullWidth: css`
    width: 100%;
  `,
}));
