import { BrainViewer, NeuronWorkbench } from '@edufish/qingzhou-ui';
import { Alert, Card, Tabs, Tag, Typography } from 'antd';
import { useTranslation } from 'react-i18next';

const MESHES = [
  { url: '/neurolab/niivue/BrainMesh_ICBM152.lh.mz3', name: 'BrainMesh_ICBM152.lh.mz3' },
  { url: '/neurolab/niivue/BrainMesh_ICBM152.rh.mz3', name: 'BrainMesh_ICBM152.rh.mz3' },
];
const VOLUME = { url: '/neurolab/niivue/mni152.nii.gz', name: 'mni152.nii.gz' };

/** Preview assembly only: real backend simulation and independent atlas view. */
export function LabPlayground({ httpAvailable }) {
  const { i18n } = useTranslation('preview');
  const zh = i18n.resolvedLanguage?.startsWith('zh');
  return (
    <section data-testid="lab-playground">
      <div className="lab-introduction">
        <Typography.Paragraph>
          {zh
            ? '调节刺激和离子通道，运行实验，观察真实计算的膜电位与离子电流。脑解剖页可独立探索标准脑表面和 MRI 切片。'
            : 'Adjust stimulation and ion channels, run an experiment, and inspect computed membrane voltage and ionic currents. Explore standard brain surfaces and MRI slices in the anatomy tab.'}
        </Typography.Paragraph>
        <Tag>{zh ? '服务端数值仿真' : 'Server-side numerical simulation'}</Tag>
        <Tag>{zh ? '结果可重现' : 'Reproducible results'}</Tag>
        <Tag>{zh ? '标准解剖模板' : 'Standard anatomy template'}</Tag>
      </div>
      <Tabs
        data-testid="lab-tabs"
        defaultActiveKey="electrophysiology"
        items={[
          {
            key: 'electrophysiology',
            label: zh ? '电生理仿真' : 'Electrophysiology',
            children: httpAvailable ? (
              <div data-testid="neuron-workbench"><NeuronWorkbench courseId="course-fixture-published" /></div>
            ) : (
              <Alert
                type="info"
                showIcon
                title={zh ? '启动真实仿真后端' : 'Start the simulation backend'}
                description={zh ? '从仓库根目录运行 npm run ui:actual，然后打开它打印的地址。' : 'Run npm run ui:actual from the repository root and open its printed URL.'}
              />
            ),
          },
          {
            key: 'anatomy',
            label: zh ? '脑解剖 · 3D / MRI' : 'Brain anatomy · 3D / MRI',
            children: (
              <Card size="small" className="brain-reference-card">
                <BrainViewer meshes={MESHES} volume={VOLUME} />
                <Typography.Paragraph type="secondary" className="atlas-attribution">
                  {zh ? '标准解剖参考：ICBM152 / MNI152。该视图不表示当前单细胞模型的空间活动。' : 'Standard anatomical reference: ICBM152 / MNI152. This view does not represent spatial activity from the single-cell simulation.'}
                  {' '}<a href="https://niivue.com/docs/loading/" target="_blank" rel="noreferrer">NiiVue</a>
                </Typography.Paragraph>
              </Card>
            ),
          },
        ]}
      />
    </section>
  );
}
