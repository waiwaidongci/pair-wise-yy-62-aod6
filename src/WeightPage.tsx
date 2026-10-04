import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Checkbox,
  Divider,
  Group,
  NumberInput,
  Progress,
  ScrollArea,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  ThemeIcon,
  Tooltip
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconCheck,
  IconCircleCheck,
  IconCircleX,
  IconClipboardList,
  IconDeviceFloppy,
  IconLock,
  IconLockOpen,
  IconPlayerPlay,
  IconRefresh,
  IconRotateClockwise,
  IconScale,
  IconSend,
  IconTool,
  IconTruck
} from '@tabler/icons-react';
import type { RootState } from './store';
import {
  clearWeightRecords,
  completeBatch,
  dismissPending,
  escalateOldDraft,
  markSaveFailed,
  recordWeighResult,
  recoverBatch,
  releasePlan,
  resolveConflict,
  retryByBatchNo,
  submitBatch
} from './store';
import { calculateStability, detectConflicts } from './store';
import type { Cargo } from './api';

function PageHeading({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  return <div className="page-heading"><div><small>{eyebrow}</small><h1>{title}</h1><p>{description}</p></div><Group gap="xs">{actions}</Group></div>;
}

const statusColor: Record<string, string> = {
  '已完成': 'teal',
  '称重中': 'blue',
  '排队中': 'orange',
  '冲突': 'red',
  '已忽略': 'gray'
};

function deviationLabel(d: number) {
  const sign = d > 0 ? '+' : '';
  return `${sign}${d.toFixed(2)}%`;
}

export default function WeightPage() {
  const dispatch = useDispatch();
  const cargo = useSelector((root: RootState) => root.stowage.cargo);
  const planRevision = useSelector((root: RootState) => root.stowage.planRevision);
  const locked = useSelector((root: RootState) => root.stowage.locked);
  const weight = useSelector((root: RootState) => root.weight);
  const stability = calculateStability(cargo);
  const conflicts = detectConflicts(cargo);

  const recordsByCargo = useMemo(() => new Map(weight.records.map((r) => [r.cargoId, r])), [weight.records]);
  const weighedCount = weight.records.length;
  const outOfTolerance = weight.records.filter((r) => !r.withinTolerance).length;
  const pendingWeigh = cargo.length - weighedCount;
  const totalDeviation = weight.records.reduce((sum, r) => sum + Math.abs(r.deviation), 0);

  const [newBatchNo, setNewBatchNo] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [weighInputs, setWeighInputs] = useState<Record<string, number | string>>({});
  const [reviewedBy, setReviewedBy] = useState('理货员·周');

  // 旧稿缺复核记录：升级并标待补（仅在首次发现无记录时）
  useEffect(() => {
    if (weight.records.length === 0 && cargo.length > 0) {
      dispatch(escalateOldDraft(cargo.map((c) => c.id)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleCargo = (id: string) => {
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const handleSubmit = (terminal: string) => {
    if (selected.length === 0) return;
    const batchNo = newBatchNo.trim() || `WB-${Date.now().toString().slice(-6)}`;
    dispatch(submitBatch({ batchNo, cargoIds: selected, terminal }));
    setSelected([]);
    setNewBatchNo('');
  };

  const handleDualSubmit = () => {
    if (selected.length === 0) return;
    const batchNo = newBatchNo.trim() || `WB-${Date.now().toString().slice(-6)}`;
    // 两个终端同时提交同一批次号：先到者占用，后到留作冲突
    dispatch(submitBatch({ batchNo, cargoIds: selected, terminal: '终端A' }));
    dispatch(submitBatch({ batchNo, cargoIds: selected, terminal: '终端B' }));
    setSelected([]);
    setNewBatchNo('');
  };

  const handleRecord = (batchId: string, item: Cargo) => {
    const raw = weighInputs[item.id];
    const value = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(value) || value <= 0) return;
    const deviation = ((value - item.declaredWeight) / item.declaredWeight) * 100;
    const withinTolerance = Math.abs(deviation) <= weight.tolerance;
    dispatch(recordWeighResult({ batchId, cargoId: item.id, declaredWeight: item.declaredWeight, weighedWeight: value, withinTolerance, reviewedBy }));
    setWeighInputs((prev) => ({ ...prev, [item.id]: '' }));
  };

  const handleFail = (batchId: string, cargoId: string) => {
    dispatch(markSaveFailed({ batchId, cargoId }));
  };

  const allWeighed = pendingWeigh === 0;
  const releaseBlocked = !allWeighed || conflicts.length > 0;

  return <div className="page">
    <PageHeading
      eyebrow="重量依据 / 复磅 · 设备 · 配载放行"
      title="复磅重量与配载放行"
      description={`容差 ±${weight.tolerance}% · 重量改动后立即重算稳性、绑扎与打印结论 · 方案 V${planRevision}`}
      actions={
        <>
          <Button variant="default" leftSection={<IconRotateClockwise size={16} />} onClick={() => { dispatch(clearWeightRecords(cargo.map((c) => c.id))); }}>模拟旧稿</Button>
          <Button color="teal" leftSection={<IconLock size={16} />} disabled={releaseBlocked || weight.releaseLocked} onClick={() => dispatch(releasePlan())}>
            {weight.releaseLocked ? '已放行' : '配载放行'}
          </Button>
        </>
      }
    />

    {weight.pendingReviews.length > 0 && (
      <div className="warning-banner" style={{ background: '#fdf3e7', borderColor: '#e6c89a' }}>
        <IconAlertTriangle size={18} />
        <strong>{weight.pendingReviews.length} 项旧稿复核记录待补</strong>
        <span>旧稿缺少复磅复核记录，已升级并标记待补；补录前相关箱子不得锁定。</span>
      </div>
    )}
    {weight.releaseLocked && (
      <div className="warning-banner" style={{ background: '#e7f4ef', borderColor: '#9fd4c4', color: '#176858' }}>
        <IconCircleCheck size={18} />
        <strong>配载已放行</strong>
        <span>重量依据已锁定，稳性、绑扎与打印结论均按复磅值重算。</span>
      </div>
    )}

    <SimpleGrid cols={{ base: 2, lg: 4 }} spacing="sm" mb="md">
      <Card padding="md" className="metric-card"><Text size="xs" c="dimmed">已复磅箱数</Text><Text fw={800} fz={23} mt={3}>{weighedCount} / {cargo.length}</Text><Text size="xs" c="teal">复磅完成率 {cargo.length ? Math.round((weighedCount / cargo.length) * 100) : 0}%</Text></Card>
      <Card padding="md" className="metric-card"><Text size="xs" c="dimmed">容差外箱子</Text><Text fw={800} fz={23} mt={3} c={outOfTolerance ? 'red' : undefined}>{outOfTolerance}</Text><Text size="xs" c={outOfTolerance ? 'red' : 'teal'}>以复磅值为准</Text></Card>
      <Card padding="md" className="metric-card"><Text size="xs" c="dimmed">待复磅箱子</Text><Text fw={800} fz={23} mt={3} c={pendingWeigh ? 'orange' : undefined}>{pendingWeigh}</Text><Text size="xs" c={pendingWeigh ? 'orange' : 'dimmed'}>{pendingWeigh ? '未复磅不得锁定' : '全部复磅'}</Text></Card>
      <Card padding="md" className="metric-card"><Text size="xs" c="dimmed">平均偏差</Text><Text fw={800} fz={23} mt={3}>{weighedCount ? (totalDeviation / weighedCount).toFixed(2) : '0.00'}%</Text><Text size="xs" c="dimmed">申报与复磅偏差</Text></Card>
    </SimpleGrid>

    <div className="overview-grid" style={{ gridTemplateColumns: 'minmax(0,1fr) 360px' }}>
      <Stack gap="sm">
        {/* 称重设备与队列 */}
        <Card padding={0}>
          <div className="panel-title"><div><strong>称重设备与队列</strong><Text size="xs" c="dimmed">容量不足时排队，重叠时后到批次可见等待位置</Text></div><IconScale size={18} /></div>
          <div style={{ padding: '12px 14px' }}>
            <SimpleGrid cols={3} spacing="sm">
              {weight.equipment.map((eq) => {
                const current = weight.batches.find((b) => b.id === eq.currentBatchId);
                return <Card key={eq.id} padding="sm" withBorder>
                  <Group justify="space-between"><Text size="sm" fw={700}>{eq.name}</Text><Badge size="xs" color={eq.status === '空闲' ? 'teal' : eq.status === '占用' ? 'blue' : 'gray'}>{eq.status}</Badge></Group>
                  <Text size="xs" c="dimmed" mt={4}>容量 {eq.capacity} 箱位</Text>
                  {current && <Text size="xs" mt={2}>当前批次 <Text span fw={700}>{current.batchNo}</Text></Text>}
                </Card>;
              })}
            </SimpleGrid>
            <Divider my="sm" />
            <Text size="xs" fw={700} mb={6}>等待队列</Text>
            {weight.batches.filter((b) => b.status === '排队中').length === 0 && <Text size="xs" c="dimmed">暂无排队批次。</Text>}
            <Stack gap={6}>
              {weight.batches.filter((b) => b.status === '排队中').sort((a, b) => (a.queuePosition ?? 0) - (b.queuePosition ?? 0)).map((b) => (
                <Group key={b.id} justify="space-between" p={6} style={{ background: '#f5f8f7', borderRadius: 4 }}>
                  <Group gap="xs"><Badge size="sm" color="orange">等待位置 {b.queuePosition}</Badge><Text size="xs" fw={700}>{b.batchNo}</Text><Text size="xs" c="dimmed">{b.terminal} · {b.cargoIds.length} 箱</Text></Group>
                  <Group gap={4}>
                    <Tooltip label="按批次号重试，不重复占台"><Button size="compact-xs" variant="default" leftSection={<IconRefresh size={12} />} onClick={() => dispatch(retryByBatchNo(b.batchNo))}>重试</Button></Tooltip>
                  </Group>
                </Group>
              ))}
            </Stack>
          </div>
        </Card>

        {/* 复磅批次 */}
        <Card padding={0}>
          <div className="panel-title"><div><strong>复磅批次</strong><Text size="xs" c="dimmed">提交批次、录入结果、保存失败恢复与冲突处理</Text></div><IconClipboardList size={18} /></div>
          <div style={{ padding: '12px 14px' }}>
            {/* 提交新批次 */}
            <Card padding="sm" withBorder mb="sm" style={{ background: '#fafcfb' }}>
              <Group gap="xs" align="end">
                <TextInput size="xs" label="批次号（留空自动生成）" placeholder="WB-XXXXXX" value={newBatchNo} onChange={(e) => setNewBatchNo(e.currentTarget.value)} style={{ width: 180 }} />
                <Text size="xs" c="dimmed" pb={4}>已选 {selected.length} 箱</Text>
              </Group>
              <ScrollArea h={72} mt="xs">
                <Group gap={6}>{cargo.map((item) => <Checkbox key={item.id} size="xs" label={`${item.bill} · ${item.declaredWeight}t`} checked={selected.includes(item.id)} onChange={() => toggleCargo(item.id)} />)}</Group>
              </ScrollArea>
              <Group gap="xs" mt="xs">
                <Button size="compact-xs" leftSection={<IconSend size={12} />} onClick={() => handleSubmit('终端A')} disabled={!selected.length}>终端A 提交</Button>
                <Button size="compact-xs" variant="default" leftSection={<IconSend size={12} />} onClick={() => handleSubmit('终端B')} disabled={!selected.length}>终端B 提交</Button>
                <Button size="compact-xs" color="grape" variant="light" leftSection={<IconPlayerPlay size={12} />} onClick={handleDualSubmit} disabled={!selected.length}>模拟两终端同时提交同一批次</Button>
              </Group>
            </Card>

            <Stack gap="sm">
              {weight.batches.filter((b) => b.status !== '已忽略').map((batch) => {
                const batchCargo = cargo.filter((c) => batch.cargoIds.includes(c.id));
                const done = batch.doneBoxes.length;
                const total = batch.cargoIds.length;
                const failedItem = batch.failedAtBox ? cargo.find((c) => c.id === batch.failedAtBox) : null;
                return <Card key={batch.id} padding="sm" withBorder>
                  <Group justify="space-between">
                    <Group gap="xs"><Text size="sm" fw={700}>{batch.batchNo}</Text><Badge size="xs" color={statusColor[batch.status]}>{batch.status}</Badge>{batch.queuePosition && <Badge size="xs" color="orange">等待位置 {batch.queuePosition}</Badge>}<Text size="xs" c="dimmed">{batch.terminal}</Text></Group>
                    <Group gap={4}>
                      {batch.status === '称重中' && done >= total && <Button size="compact-xs" color="teal" leftSection={<IconCheck size={12} />} onClick={() => dispatch(completeBatch(batch.id))}>完成批次</Button>}
                      {batch.status === '冲突' && <Button size="compact-xs" variant="default" leftSection={<IconRefresh size={12} />} onClick={() => dispatch(retryByBatchNo(batch.batchNo))}>按批次号重试</Button>}
                    </Group>
                  </Group>
                  <Text size="xs" c="dimmed" mt={4}>{batch.equipmentId ? `设备 ${weight.equipment.find((e) => e.id === batch.equipmentId)?.name ?? batch.equipmentId}` : '未分配设备'} · 进度 {done}/{total}{batch.startedAt ? ` · 开始 ${batch.startedAt}` : ''}{batch.completedAt ? ` · 完成 ${batch.completedAt}` : ''}</Text>
                  {batch.status === '冲突' && batch.conflictPayload && (
                    <div className="conflict-row" style={{ marginTop: 6 }}>
                      <Badge size="xs" color="red">冲突</Badge>
                      <div><strong>后到内容留作冲突</strong><span>{batch.conflictPayload}</span></div>
                    </div>
                  )}
                  {batch.status === '冲突' && (
                    <Group gap="xs" mt={6}>
                      <Button size="compact-xs" color="teal" onClick={() => dispatch(resolveConflict({ batchId: batch.id, decision: 'keep-first' }))}>保留先到</Button>
                      <Button size="compact-xs" variant="default" onClick={() => dispatch(resolveConflict({ batchId: batch.id, decision: 'adopt-later' }))}>采纳后到</Button>
                    </Group>
                  )}
                  {failedItem && (
                    <div className="conflict-row" style={{ marginTop: 6, borderTopColor: '#f0dfc5' }}>
                      <Badge size="xs" color="orange">保存失败</Badge>
                      <div><strong>从最后完成箱恢复</strong><span>失败箱 {failedItem.bill}，已完成 {done} 箱，恢复后从 {failedItem.bill} 继续，不重复占台。</span></div>
                    </div>
                  )}
                  {batch.status === '称重中' && (
                    <Stack gap={6} mt="xs">
                      {batchCargo.filter((c) => !batch.doneBoxes.includes(c.id)).map((item) => (
                        <Group key={item.id} gap="xs" align="end">
                          <Text size="xs" style={{ width: 120 }}>{item.bill}<br /><Text span c="dimmed">申报 {item.declaredWeight}t</Text></Text>
                          <NumberInput size="xs" label="复磅值(t)" style={{ width: 110 }} value={weighInputs[item.id] ?? ''} onChange={(v) => setWeighInputs((p) => ({ ...p, [item.id]: v }))} />
                          <Button size="compact-xs" onClick={() => handleRecord(batch.id, item)}>录入</Button>
                          {!batch.failedAtBox && <Tooltip label="模拟保存失败"><ActionIcon size="sm" variant="light" color="orange" onClick={() => handleFail(batch.id, item.id)}><IconDeviceFloppy size={14} /></ActionIcon></Tooltip>}
                        </Group>
                      ))}
                      {batchCargo.filter((c) => !batch.doneBoxes.includes(c.id)).length === 0 && <Text size="xs" c="teal">本批已全部录入，可完成批次。</Text>}
                      {batch.failedAtBox && <Button size="compact-xs" color="teal" variant="light" leftSection={<IconRotateClockwise size={12} />} onClick={() => dispatch(recoverBatch(batch.id))}>从最后完成箱恢复（已完成 {done}/{total}）</Button>}
                    </Stack>
                  )}
                  {batch.status === '已完成' && (
                    <Group gap={6} mt="xs">{batchCargo.map((c) => { const r = recordsByCargo.get(c.id); return <Badge key={c.id} size="xs" color={r?.withinTolerance ? 'teal' : 'red'}>{c.bill} {r ? deviationLabel(r.deviation) : ''}</Badge>; })}</Group>
                  )}
                </Card>;
              })}
            </Stack>
          </div>
        </Card>

        {/* 货物重量对照表 */}
        <Card padding={0}>
          <div className="panel-title"><div><strong>货物重量对照</strong><Text size="xs" c="dimmed">超出容差以复磅值为准，未复磅不得锁定</Text></div><IconTruck size={18} /></div>
          <Table verticalSpacing="xs" striped>
            <Table.Thead><Table.Tr><Table.Th>箱号</Table.Th><Table.Th>申报重(t)</Table.Th><Table.Th>复磅重(t)</Table.Th><Table.Th>偏差</Table.Th><Table.Th>重量依据</Table.Th><Table.Th>状态</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>
              {cargo.map((item) => {
                const r = recordsByCargo.get(item.id);
                return <Table.Tr key={item.id}>
                  <Table.Td fw={700}>{item.bill}</Table.Td>
                  <Table.Td>{item.declaredWeight.toFixed(1)}</Table.Td>
                  <Table.Td>{item.weighedWeight ? item.weighedWeight.toFixed(1) : '—'}</Table.Td>
                  <Table.Td>{r ? <Text span c={r.withinTolerance ? 'teal' : 'red'} fw={700}>{deviationLabel(r.deviation)}</Text> : '—'}</Table.Td>
                  <Table.Td><Badge size="xs" color={item.weightBasis === '复磅' ? 'teal' : 'gray'}>{item.weightBasis}</Badge></Table.Td>
                  <Table.Td><Badge size="xs" color={item.weighStatus === '已复磅' ? 'teal' : item.weighStatus === '容差外' ? 'red' : 'orange'}>{item.weighStatus}</Badge></Table.Td>
                </Table.Tr>;
              })}
            </Table.Tbody>
          </Table>
        </Card>
      </Stack>

      <Stack gap="sm">
        {/* 配载放行 */}
        <Card padding="md">
          <div className="panel-title" style={{ padding: 0, border: 0, minHeight: 'auto' }}><div><strong>配载放行</strong><Text size="xs" c="dimmed">复磅、稳性、绑扎、打印结论联动</Text></div>{weight.releaseLocked ? <IconLock size={18} /> : <IconLockOpen size={18} />}</div>
          <Stack gap="xs" mt="md">
            <Group justify="space-between"><Text size="xs">复磅完成率</Text><Text size="xs" fw={700} c={allWeighed ? 'teal' : 'orange'}>{weighedCount}/{cargo.length}</Text></Group>
            <Progress value={cargo.length ? (weighedCount / cargo.length) * 100 : 0} color={allWeighed ? 'teal' : 'orange'} size="sm" />
            <Divider />
            <Group justify="space-between"><Text size="xs">稳性裕度</Text><Badge size="xs" color={stability.stability > 70 ? 'teal' : 'orange'}>{stability.stability.toFixed(1)}%</Badge></Group>
            <Group justify="space-between"><Text size="xs">纵倾</Text><Badge size="xs" color="gray">{stability.trim}</Badge></Group>
            <Group justify="space-between"><Text size="xs">绑扎/配载冲突</Text><Badge size="xs" color={conflicts.length ? 'red' : 'teal'}>{conflicts.length} 项</Badge></Group>
            <Group justify="space-between"><Text size="xs">重量依据</Text><Badge size="xs" color={allWeighed ? 'teal' : 'orange'}>{allWeighed ? '全部复磅' : `${pendingWeigh} 箱未复磅`}</Badge></Group>
            <Text size="xs" c="dimmed" mt={4}>重量改动后立即重算稳性、绑扎与打印结论；超出容差的箱子以复磅值为准，未复磅的箱子不能锁定。</Text>
            <Button color="teal" leftSection={<IconLock size={16} />} disabled={releaseBlocked || weight.releaseLocked} onClick={() => dispatch(releasePlan())}>
              {weight.releaseLocked ? '已放行' : '锁定并放行配载'}
            </Button>
            {releaseBlocked && !weight.releaseLocked && <Text size="xs" c="orange">存在未复磅箱子或配载冲突，暂不能放行。</Text>}
          </Stack>
        </Card>

        {/* 待补复核 */}
        <Card padding="md">
          <div className="panel-title" style={{ padding: 0, border: 0, minHeight: 'auto' }}><div><strong>待补复核记录</strong><Text size="xs" c="dimmed">旧稿升级，标待补</Text></div><IconTool size={18} /></div>
          {weight.pendingReviews.length === 0 ? <Text size="xs" c="dimmed" mt="md">无待补记录。</Text> : <Stack gap={6} mt="md">
            {weight.pendingReviews.map((p) => {
              const c = cargo.find((x) => x.id === p.cargoId);
              return <div key={p.id} className="limit-row">
                <div><Text size="xs" fw={700}>{c?.bill ?? p.cargoId} · <Badge size="xs" color="orange">{p.status}</Badge></Text><Text size="xs" c="dimmed">{p.reason}</Text><Text size="xs" c="dimmed">升级于 {p.escalatedAt}</Text></div>
                <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => dispatch(dismissPending(p.id))}><IconCircleX size={14} /></ActionIcon>
              </div>;
            })}
          </Stack>}
        </Card>

        {/* 最近恢复 */}
        {weight.lastRecoveredBatchNo && (
          <Card padding="md" withBorder>
            <Group gap="xs"><IconRotateClockwise size={16} color="teal" /><Text size="xs">已按批次号 <Text span fw={700}>{weight.lastRecoveredBatchNo}</Text> 恢复，未重复占台。</Text></Group>
          </Card>
        )}
      </Stack>
    </div>
  </div>;
}
