import { createStaticStyles } from 'antd-style';

/**
 * Locally scoped lab structure only. Colors, type, spacing and radii come from
 * the host's semantic tokens so light/dark and host themes are inherited.
 */
export const labStyles = createStaticStyles(({ css, cssVar }) => ({
  root: css`
    display: grid;
    grid-template-columns: minmax(280px, 340px) minmax(0, 1fr);
    align-items: start;
    gap: ${cssVar.margin};
    min-width: 0;
    color: ${cssVar.colorText};
    font-family: ${cssVar.fontFamily};
    font-size: ${cssVar.fontSize};
    line-height: ${cssVar.lineHeight};

    @media (max-width: 960px) {
      display: flex;
      flex-direction: column;
      align-items: stretch;
    }
  `,
  header: css`
    grid-column: 1 / -1;
    display: flex;
    flex-direction: column;
    gap: ${cssVar.marginXS};
    min-width: 0;
  `,
  title: css`
    margin: 0;
    font-size: ${cssVar.fontSizeXL};
    font-weight: 600;
    line-height: ${cssVar.lineHeight};
    overflow-wrap: anywhere;
  `,
  description: css`
    margin: 0;
    color: ${cssVar.colorTextSecondary};
    overflow-wrap: anywhere;
  `,
  section: css`
    display: flex;
    flex-direction: column;
    gap: ${cssVar.marginSM};
    min-width: 0;
    padding: ${cssVar.paddingSM};
    background: ${cssVar.colorBgContainer};
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusLG};
  `,
  card: css`
    display: flex;
    flex-direction: column;
    gap: ${cssVar.marginXS};
    min-width: 0;
    padding: ${cssVar.paddingSM};
    background: ${cssVar.colorFillQuaternary};
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusLG};
  `,
  sectionHeader: css`
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: ${cssVar.marginXS};
    min-width: 0;
  `,
  sectionTitle: css`
    margin: 0;
    font-size: ${cssVar.fontSize};
    font-weight: 600;
    overflow-wrap: anywhere;
  `,
  row: css`
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: ${cssVar.marginXS};
    min-width: 0;
  `,
  actions: css`
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: ${cssVar.marginXS};
  `,
  alertStack: css`
    display: flex;
    flex-direction: column;
    gap: ${cssVar.marginXS};
  `,
  muted: css`
    margin: 0;
    color: ${cssVar.colorTextSecondary};
    font-size: ${cssVar.fontSizeSM};
    overflow-wrap: anywhere;
  `,
  body: css`
    margin: 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  `,
  field: css`
    display: flex;
    flex-direction: column;
    gap: ${cssVar.marginXXS};
    min-width: 0;
  `,
  fieldHeader: css`
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: ${cssVar.marginXS};
  `,
  fieldLabel: css`
    font-weight: 500;
    overflow-wrap: anywhere;
  `,
  numericGroup: css`
    display: inline-flex;
    align-items: center;
    gap: ${cssVar.marginXXS};
    color: ${cssVar.colorTextSecondary};
    font-size: ${cssVar.fontSizeSM};
  `,
  presetRow: css`
    display: flex;
    flex-wrap: wrap;
    gap: ${cssVar.marginXS};
  `,
  runList: css`
    display: flex;
    flex-direction: column;
    gap: ${cssVar.marginXS};
    margin: 0;
    padding: 0;
    list-style: none;
  `,
  chartStack: css`
    display: flex;
    flex-direction: column;
    gap: ${cssVar.marginSM};
    min-width: 0;
  `,
  chartFigure: css`
    min-width: 0;
    margin: 0;
  `,
  chartHost: css`
    width: 100%;
    min-width: 0;
    background: ${cssVar.colorFillQuaternary};
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusLG};
  `,
  tableWrapper: css`
    width: 100%;
    overflow-x: auto;
  `,
  table: css`
    width: 100%;
    border-collapse: collapse;
    font-size: ${cssVar.fontSizeSM};
  `,
  tableCaption: css`
    margin-bottom: ${cssVar.marginXS};
    color: ${cssVar.colorTextSecondary};
    text-align: start;
  `,
  tableHeaderCell: css`
    padding: ${cssVar.paddingXXS} ${cssVar.paddingXS};
    color: ${cssVar.colorTextSecondary};
    font-weight: 600;
    text-align: start;
    white-space: nowrap;
    border-bottom: 1px solid ${cssVar.colorBorderSecondary};
  `,
  tableCell: css`
    padding: ${cssVar.paddingXXS} ${cssVar.paddingXS};
    color: ${cssVar.colorText};
    text-align: start;
    white-space: nowrap;
    border-bottom: 1px solid ${cssVar.colorBorderSecondary};
  `,
  details: css`
    min-width: 0;
  `,
  detailsSummary: css`
    cursor: pointer;
    color: ${cssVar.colorTextSecondary};
    font-size: ${cssVar.fontSizeSM};
  `,
  definitionList: css`
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: ${cssVar.marginXXS} ${cssVar.marginSM};
    margin: ${cssVar.marginXS} 0 0;
    font-size: ${cssVar.fontSizeSM};
  `,
  definitionTerm: css`
    color: ${cssVar.colorTextSecondary};
  `,
  definitionValue: css`
    margin: 0;
    color: ${cssVar.colorText};
    overflow-wrap: anywhere;
  `,
  metricGrid: css`
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: ${cssVar.marginXS};
    margin: 0;
  `,
  metricItem: css`
    display: flex;
    flex-direction: column;
    gap: ${cssVar.marginXXS};
    min-width: 0;
    padding: ${cssVar.paddingXS};
    background: ${cssVar.colorFillQuaternary};
    border-radius: ${cssVar.borderRadius};
  `,
  metricLabel: css`
    color: ${cssVar.colorTextSecondary};
    font-size: ${cssVar.fontSizeSM};
  `,
  metricValue: css`
    font-weight: 600;
    overflow-wrap: anywhere;
  `,
  srOnly: css`
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    white-space: nowrap;
    border: 0;
    clip: rect(0, 0, 0, 0);
  `,
  spikeList: css`
    display: flex;
    flex-wrap: wrap;
    gap: ${cssVar.marginXXS};
    margin: ${cssVar.marginXS} 0 0;
    padding: 0;
    list-style: none;
    font-size: ${cssVar.fontSizeSM};
  `,
  spikeItem: css`
    padding: 0 ${cssVar.paddingXXS};
    font-family: ${cssVar.fontFamilyCode};
    background: ${cssVar.colorFillQuaternary};
    border-radius: ${cssVar.borderRadiusSM};
  `,
}));
