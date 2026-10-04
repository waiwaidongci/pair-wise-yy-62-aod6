import { configureStore, createAction, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { stowageApi, type Cargo, type CargoType } from './api';

export type StowageComment = {
  id: string;
  cargoId: string;
  author: string;
  role: '船长' | '码头' | '货主';
  content: string;
  status: '待确认' | '已接受' | '已退回';
};

/* ----------------------------- 重量依据域 ----------------------------- */

/** 称重设备（地磅） */
export type WeighEquipment = {
  id: string;
  name: string;
  /** 一次可容纳的箱位数 */
  capacity: number;
  status: '空闲' | '占用' | '维护';
  currentBatchId: string | null;
};

/** 复磅批次 */
export type WeighBatch = {
  id: string;
  /** 批次号，两个终端可提交同一批次号，先到者占用 */
  batchNo: string;
  cargoIds: string[];
  equipmentId: string | null;
  status: '排队中' | '称重中' | '已完成' | '冲突' | '已忽略';
  /** 排队等待位置，重叠时后到批次可见 */
  queuePosition: number | null;
  terminal: string;
  startedAt: string | null;
  completedAt: string | null;
  /** 冲突时指向先到批次 */
  conflictOf: string | null;
  /** 后到内容留作冲突凭据 */
  conflictPayload: string | null;
  /** 已完成箱位，用于保存失败后从最后完成箱恢复 */
  doneBoxes: string[];
  /** 保存失败时正在写入的箱位 */
  failedAtBox: string | null;
};

/** 单箱复磅记录 */
export type WeighRecord = {
  cargoId: string;
  batchId: string;
  declaredWeight: number;
  weighedWeight: number;
  /** 偏差百分比，正为超重、负为欠重 */
  deviation: number;
  withinTolerance: boolean;
  reviewedBy: string;
  reviewedAt: string;
};

/** 待补复核记录（旧稿升级） */
export type PendingReview = {
  id: string;
  cargoId: string;
  reason: string;
  escalatedAt: string;
  status: '待补';
};

type WeightState = {
  equipment: WeighEquipment[];
  batches: WeighBatch[];
  records: WeighRecord[];
  pendingReviews: PendingReview[];
  /** 容差百分比 */
  tolerance: number;
  releaseLocked: boolean;
  lastRecoveredBatchNo: string | null;
};

const nowTime = () => new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

const defaultEquipment: WeighEquipment[] = [
  { id: 'EQ-1', name: '1号地磅', capacity: 6, status: '占用', currentBatchId: 'WB-2609-02' },
  { id: 'EQ-2', name: '2号地磅', capacity: 3, status: '空闲', currentBatchId: null },
  { id: 'EQ-3', name: '3号地磅', capacity: 4, status: '维护', currentBatchId: null }
];

const defaultBatches: WeighBatch[] = [
  { id: 'WB-2609-01', batchNo: 'WB-2609-01', cargoIds: ['BL-88214', 'BL-88219'], equipmentId: 'EQ-1', status: '已完成', queuePosition: null, terminal: '终端A', startedAt: '09:10', completedAt: '09:32', conflictOf: null, conflictPayload: null, doneBoxes: ['BL-88214', 'BL-88219'], failedAtBox: null },
  { id: 'WB-2609-02', batchNo: 'WB-2609-02', cargoIds: ['BL-88247', 'BL-88254'], equipmentId: 'EQ-1', status: '称重中', queuePosition: null, terminal: '终端A', startedAt: '09:40', completedAt: null, conflictOf: null, conflictPayload: null, doneBoxes: ['BL-88254'], failedAtBox: null },
  { id: 'WB-2609-03', batchNo: 'WB-2609-03', cargoIds: ['BL-88231'], equipmentId: null, status: '排队中', queuePosition: 1, terminal: '终端A', startedAt: null, completedAt: null, conflictOf: null, conflictPayload: null, doneBoxes: [], failedAtBox: null },
  { id: 'WB-2609-04', batchNo: 'WB-2609-04', cargoIds: ['BL-88240'], equipmentId: null, status: '排队中', queuePosition: 2, terminal: '终端A', startedAt: null, completedAt: null, conflictOf: null, conflictPayload: null, doneBoxes: [], failedAtBox: null },
  { id: 'WB-2609-06', batchNo: 'WB-2609-06', cargoIds: ['BL-88231'], equipmentId: null, status: '排队中', queuePosition: 3, terminal: '终端A', startedAt: null, completedAt: null, conflictOf: null, conflictPayload: null, doneBoxes: [], failedAtBox: null },
  { id: 'WB-2609-06-LATE', batchNo: 'WB-2609-06', cargoIds: ['BL-88231'], equipmentId: null, status: '冲突', queuePosition: null, terminal: '终端B', startedAt: null, completedAt: null, conflictOf: 'WB-2609-06', conflictPayload: '{"batchNo":"WB-2609-06","cargoIds":["BL-88231"],"terminal":"终端B","submittedAt":"09:57"}', doneBoxes: [], failedAtBox: null }
];

const defaultRecords: WeighRecord[] = [
  { cargoId: 'BL-88214', batchId: 'WB-2609-01', declaredWeight: 24.6, weighedWeight: 25.8, deviation: 4.88, withinTolerance: true, reviewedBy: '理货员·周', reviewedAt: '09:20' },
  { cargoId: 'BL-88219', batchId: 'WB-2609-01', declaredWeight: 28.1, weighedWeight: 31.2, deviation: 11.03, withinTolerance: false, reviewedBy: '理货员·周', reviewedAt: '09:25' },
  { cargoId: 'BL-88247', batchId: 'WB-2609-02', declaredWeight: 112.5, weighedWeight: 118.6, deviation: 5.42, withinTolerance: false, reviewedBy: '理货员·李', reviewedAt: '09:48' },
  { cargoId: 'BL-88254', batchId: 'WB-2609-02', declaredWeight: 286.0, weighedWeight: 279.5, deviation: -2.27, withinTolerance: true, reviewedBy: '理货员·李', reviewedAt: '09:44' }
];

const defaultWeightState: WeightState = {
  equipment: defaultEquipment,
  batches: defaultBatches,
  records: defaultRecords,
  pendingReviews: [],
  tolerance: 5,
  releaseLocked: false,
  lastRecoveredBatchNo: null
};

const weightRaw = typeof localStorage !== 'undefined' ? localStorage.getItem('yy62-weight-plan') : null;
const weightInitial: WeightState = weightRaw ? JSON.parse(weightRaw) : defaultWeightState;

const weightSlice = createSlice({
  name: 'weight',
  initialState: weightInitial,
  reducers: {
    /** 提交复磅批次：先到者占用，同批次号后到内容留作冲突；容量不足排队 */
    submitBatch(state, action: PayloadAction<{ batchNo: string; cargoIds: string[]; terminal: string }>) {
      const { batchNo, cargoIds, terminal } = action.payload;
      const first = state.batches.find((b) => b.batchNo === batchNo && b.status !== '已忽略');
      if (first) {
        state.batches.push({
          id: `${batchNo}-LATE-${Date.now()}`,
          batchNo,
          cargoIds,
          equipmentId: null,
          status: '冲突',
          queuePosition: null,
          terminal,
          startedAt: null,
          completedAt: null,
          conflictOf: first.id,
          conflictPayload: JSON.stringify({ batchNo, cargoIds, terminal, submittedAt: nowTime() }),
          doneBoxes: [],
          failedAtBox: null
        });
        return;
      }
      const equip = state.equipment.find((e) => e.status === '空闲' && e.capacity >= cargoIds.length);
      const id = `WB-${Date.now()}`;
      if (equip) {
        state.batches.push({ id, batchNo, cargoIds, equipmentId: equip.id, status: '称重中', queuePosition: null, terminal, startedAt: nowTime(), completedAt: null, conflictOf: null, conflictPayload: null, doneBoxes: [], failedAtBox: null });
        equip.status = '占用';
        equip.currentBatchId = id;
      } else {
        const pos = state.batches.filter((b) => b.status === '排队中').length + 1;
        state.batches.push({ id, batchNo, cargoIds, equipmentId: null, status: '排队中', queuePosition: pos, terminal, startedAt: null, completedAt: null, conflictOf: null, conflictPayload: null, doneBoxes: [], failedAtBox: null });
      }
    },
    /** 录入单箱复磅结果，立即形成重量依据 */
    recordWeighResult(state, action: PayloadAction<{ batchId: string; cargoId: string; declaredWeight: number; weighedWeight: number; withinTolerance: boolean; reviewedBy: string }>) {
      const batch = state.batches.find((b) => b.id === action.payload.batchId);
      if (!batch) return;
      const { cargoId, declaredWeight, weighedWeight, withinTolerance, reviewedBy } = action.payload;
      const deviation = ((weighedWeight - declaredWeight) / declaredWeight) * 100;
      const rec: WeighRecord = { cargoId, batchId: batch.batchNo, declaredWeight, weighedWeight, deviation, withinTolerance, reviewedBy, reviewedAt: nowTime() };
      const idx = state.records.findIndex((r) => r.cargoId === cargoId);
      if (idx >= 0) state.records[idx] = rec; else state.records.push(rec);
      if (!batch.doneBoxes.includes(cargoId)) batch.doneBoxes.push(cargoId);
      batch.failedAtBox = null;
    },
    /** 完成批次，释放设备并推进队列 */
    completeBatch(state, action: PayloadAction<string>) {
      const batch = state.batches.find((b) => b.id === action.payload);
      if (!batch) return;
      batch.status = '已完成';
      batch.completedAt = nowTime();
      const equip = state.equipment.find((e) => e.id === batch.equipmentId);
      if (equip) { equip.status = '空闲'; equip.currentBatchId = null; }
      const next = state.batches.filter((b) => b.status === '排队中').sort((a, b) => (a.queuePosition ?? 0) - (b.queuePosition ?? 0))[0];
      if (next) {
        const free = state.equipment.find((e) => e.status === '空闲' && e.capacity >= next.cargoIds.length);
        if (free) {
          next.equipmentId = free.id;
          next.status = '称重中';
          next.queuePosition = null;
          next.startedAt = nowTime();
          free.status = '占用';
          free.currentBatchId = next.id;
        }
      }
      state.batches.filter((b) => b.status === '排队中').sort((a, b) => (a.queuePosition ?? 0) - (b.queuePosition ?? 0)).forEach((b, i) => { b.queuePosition = i + 1; });
    },
    /** 模拟保存失败，记录失败箱位 */
    markSaveFailed(state, action: PayloadAction<{ batchId: string; cargoId: string }>) {
      const batch = state.batches.find((b) => b.id === action.payload.batchId);
      if (batch) batch.failedAtBox = action.payload.cargoId;
    },
    /** 从最后完成箱恢复，失败箱之前的不重复录入 */
    recoverBatch(state, action: PayloadAction<string>) {
      const batch = state.batches.find((b) => b.id === action.payload);
      if (!batch) return;
      batch.failedAtBox = null;
      state.lastRecoveredBatchNo = batch.batchNo;
    },
    /** 按批次号重试：不重复占台，已有设备保持，冲突/排队重新获得位置 */
    retryByBatchNo(state, action: PayloadAction<string>) {
      const batch = state.batches.find((b) => b.batchNo === action.payload && b.status !== '已忽略');
      if (!batch) return;
      state.lastRecoveredBatchNo = batch.batchNo;
      batch.failedAtBox = null;
      if (batch.status === '冲突') {
        batch.status = batch.equipmentId ? '称重中' : '排队中';
        if (!batch.equipmentId) {
          const pos = state.batches.filter((b) => b.status === '排队中').length + 1;
          batch.queuePosition = pos;
        }
      }
    },
    /** 冲突处理：保留先到 / 采纳后到 */
    resolveConflict(state, action: PayloadAction<{ batchId: string; decision: 'keep-first' | 'adopt-later' }>) {
      const later = state.batches.find((b) => b.id === action.payload.batchId);
      if (!later || later.status !== '冲突') return;
      const first = state.batches.find((b) => b.id === later.conflictOf);
      if (action.payload.decision === 'keep-first') {
        later.status = '已忽略';
      } else {
        later.status = later.equipmentId ? '称重中' : '排队中';
        if (!later.equipmentId) {
          const pos = state.batches.filter((b) => b.status === '排队中').length + 1;
          later.queuePosition = pos;
        }
        if (first) {
          first.status = '冲突';
          first.conflictOf = later.id;
          first.conflictPayload = JSON.stringify({ batchNo: first.batchNo, cargoIds: first.cargoIds, terminal: first.terminal, note: '被后到内容取代' });
        }
      }
    },
    /** 旧稿缺复核记录：升级并标待补 */
    escalateOldDraft(state, action: PayloadAction<string[]>) {
      const existing = new Set(state.pendingReviews.map((p) => p.cargoId));
      action.payload.forEach((cargoId) => {
        if (!existing.has(cargoId)) {
          state.pendingReviews.push({
            id: `PR-${cargoId}-${Date.now()}`,
            cargoId,
            reason: '旧稿缺少复磅复核记录，重量依据不完整',
            escalatedAt: nowTime(),
            status: '待补'
          });
        }
      });
    },
    dismissPending(state, action: PayloadAction<string>) {
      state.pendingReviews = state.pendingReviews.filter((p) => p.id !== action.payload);
    },
    releasePlan(state) { state.releaseLocked = true; },
    resetRelease(state) { state.releaseLocked = false; },
    /** 演示旧稿：清空复核记录与批次，触发待补升级 */
    clearWeightRecords(state, action: PayloadAction<string[]>) {
      state.records = [];
      state.batches = state.batches.map((b) => ({ ...b, status: '已忽略' as const, doneBoxes: [], failedAtBox: null }));
      state.releaseLocked = false;
      const now = nowTime();
      action.payload.forEach((cargoId) => {
        state.pendingReviews.push({
          id: `PR-${cargoId}-${Date.now()}`,
          cargoId,
          reason: '旧稿缺少复磅复核记录，重量依据不完整',
          escalatedAt: now,
          status: '待补'
        });
      });
    }
  }
});

export const {
  submitBatch, recordWeighResult, completeBatch, markSaveFailed, recoverBatch,
  retryByBatchNo, resolveConflict, escalateOldDraft, dismissPending, releasePlan,
  resetRelease, clearWeightRecords
} = weightSlice.actions;

/* ----------------------------- 配载域 ----------------------------- */

type State = {
  cargo: Cargo[];
  activeCargoId: string;
  planRevision: number;
  comments: StowageComment[];
  acceptedLimits: string[];
  locked: boolean;
  viewMode: '3d' | 'section';
  draftSavedAt: string;
};

const initialCargo: Cargo[] = [
  { id: 'BL-88214', bill: 'SEA-88214', type: '集装箱', bay: 12, row: 4, tier: 2, deck: '主甲板', weight: 25.8, declaredWeight: 24.6, weighedWeight: 25.8, weightBasis: '复磅', weighStatus: '已复磅', batchId: 'WB-2609-01', dimension: '40 × 8 × 8.6 ft', port: '温哥华', hazmat: '无', lashing: '已绑扎', color: '#2b7c75' },
  { id: 'BL-88219', bill: 'SEA-88219', type: '集装箱', bay: 13, row: 4, tier: 2, deck: '主甲板', weight: 31.2, declaredWeight: 28.1, weighedWeight: 31.2, weightBasis: '复磅', weighStatus: '容差外', batchId: 'WB-2609-01', dimension: '40 × 8 × 8.6 ft', port: '温哥华', hazmat: 'UN 1263', lashing: '需复核', color: '#c77835' },
  { id: 'BL-88231', bill: 'SEA-88231', type: '集装箱', bay: 10, row: 6, tier: 1, deck: '主甲板', weight: 18.2, declaredWeight: 18.2, weighedWeight: null, weightBasis: '申报', weighStatus: '待复磅', batchId: null, dimension: '20 × 8 × 8.6 ft', port: '釜山', hazmat: '无', lashing: '已绑扎', color: '#366d94' },
  { id: 'BL-88240', bill: 'SEA-88240', type: '集装箱', bay: 8, row: 2, tier: 2, deck: '货舱', weight: 31.4, declaredWeight: 31.4, weighedWeight: null, weightBasis: '申报', weighStatus: '待复磅', batchId: null, dimension: '40 × 8 × 8.6 ft', port: '温哥华', hazmat: '无', lashing: '待绑扎', color: '#6d528d' },
  { id: 'BL-88247', bill: 'SEA-88247', type: '重大件', bay: 15, row: 0, tier: 1, deck: '主甲板', weight: 118.6, declaredWeight: 112.5, weighedWeight: 118.6, weightBasis: '复磅', weighStatus: '容差外', batchId: 'WB-2609-02', dimension: '18.4 × 4.2 × 4.8 m', port: '温哥华', hazmat: '无', lashing: '需复核', color: '#b64f49' },
  { id: 'BL-88254', bill: 'SEA-88254', type: '散货', bay: 5, row: 0, tier: 0, deck: '货舱', weight: 279.5, declaredWeight: 286.0, weighedWeight: 279.5, weightBasis: '复磅', weighStatus: '已复磅', batchId: 'WB-2609-02', dimension: '散装 / 420 m³', port: '釜山', hazmat: '无', lashing: '已绑扎', color: '#9a7836' }
];

const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('yy62-stowage-plan') : null;
const saved = raw ? JSON.parse(raw) : null;
const initialState: State = saved ?? {
  cargo: initialCargo,
  activeCargoId: 'BL-88247',
  planRevision: 5,
  comments: [
    { id: 'CM-21', cargoId: 'BL-88219', author: '港方配载', role: '码头', content: '危险品箱与船员生活区保持隔离，请在最终图中标注危险品隔离线。', status: '待确认' },
    { id: 'CM-22', cargoId: 'BL-88247', author: '周船长', role: '船长', content: '重大件横向支撑需增加两组绑扎点，检查甲板局部强度。', status: '待确认' },
    { id: 'CM-23', cargoId: 'BL-88254', author: '货主代表', role: '货主', content: '釜山港卸货前不得覆盖散货舱口，已接受当前安排。', status: '已接受' }
  ],
  acceptedLimits: [],
  locked: false,
  viewMode: '3d',
  draftSavedAt: '09:52'
};

const slice = createSlice({
  name: 'stowage',
  initialState,
  reducers: {
    selectCargo(state, action: PayloadAction<string>) { state.activeCargoId = action.payload; },
    moveCargo(state, action: PayloadAction<{ id: string; bay: number; row: number; tier: number }>) {
      const cargo = state.cargo.find((item) => item.id === action.payload.id);
      if (cargo) Object.assign(cargo, action.payload);
      state.planRevision += 1;
      state.draftSavedAt = nowTime();
    },
    updateLashing(state, action: PayloadAction<{ id: string; lashing: Cargo['lashing'] }>) {
      const cargo = state.cargo.find((item) => item.id === action.payload.id);
      if (cargo) cargo.lashing = action.payload.lashing;
    },
    addComment(state, action: PayloadAction<{ cargoId: string; author: string; role: StowageComment['role']; content: string }>) {
      state.comments.unshift({ ...action.payload, id: `CM-${Date.now()}`, status: '待确认' });
    },
    acceptComment(state, action: PayloadAction<string>) {
      const comment = state.comments.find((item) => item.id === action.payload);
      if (comment) comment.status = '已接受';
    },
    rejectComment(state, action: PayloadAction<string>) {
      const comment = state.comments.find((item) => item.id === action.payload);
      if (comment) comment.status = '已退回';
    },
    acceptLimit(state, action: PayloadAction<string>) {
      if (!state.acceptedLimits.includes(action.payload)) state.acceptedLimits.push(action.payload);
    },
    setViewMode(state, action: PayloadAction<'3d' | 'section'>) { state.viewMode = action.payload; },
    lockPlan(state) { state.locked = true; state.planRevision += 1; }
  },
  extraReducers: (builder) => {
    builder.addCase(recordWeighResult, (state, action) => {
      const cargo = state.cargo.find((item) => item.id === action.payload.cargoId);
      if (cargo) {
        cargo.weighedWeight = action.payload.weighedWeight;
        cargo.weight = action.payload.weighedWeight;
        cargo.weightBasis = '复磅';
        cargo.weighStatus = action.payload.withinTolerance ? '已复磅' : '容差外';
        cargo.batchId = action.payload.batchId;
        state.planRevision += 1;
        state.draftSavedAt = nowTime();
      }
    });
  }
});

export const { selectCargo, moveCargo, updateLashing, addComment, acceptComment, rejectComment, acceptLimit, setViewMode, lockPlan } = slice.actions;

export const store = configureStore({
  reducer: {
    stowage: slice.reducer,
    weight: weightSlice.reducer,
    [stowageApi.reducerPath]: stowageApi.reducer
  },
  middleware: (getDefault) => getDefault().concat(stowageApi.middleware)
});

store.subscribe(() => {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('yy62-stowage-plan', JSON.stringify(store.getState().stowage));
    localStorage.setItem('yy62-weight-plan', JSON.stringify(store.getState().weight));
  }
});

export type RootState = ReturnType<typeof store.getState>;

export function calculateStability(cargo: Cargo[]) {
  const total = cargo.reduce((sum, item) => sum + item.weight, 0);
  const longitudinal = cargo.reduce((sum, item) => sum + item.weight * item.bay, 0) / Math.max(total, 1);
  const vertical = cargo.reduce((sum, item) => sum + item.weight * (item.tier + 1), 0) / Math.max(total, 1);
  const deckLoad = cargo.filter((item) => item.deck === '主甲板').reduce((sum, item) => sum + item.weight, 0);
  const stability = Math.max(0, 92 - Math.abs(longitudinal - 10.8) * 2.2 - Math.max(0, vertical - 1.75) * 8);
  return {
    total,
    longitudinal,
    vertical,
    deckLoad,
    stability,
    trim: (longitudinal - 10.8) < -0.4 ? '艉倾' : (longitudinal - 10.8) > 0.4 ? '艏倾' : '正平'
  };
}

export function detectConflicts(cargo: Cargo[]) {
  const issues: { id: string; cargoId: string; level: 'high' | 'medium'; title: string; detail: string }[] = [];
  const slots = new Map<string, Cargo>();
  cargo.forEach((item) => {
    const key = `${item.deck}-${item.bay}-${item.row}-${item.tier}`;
    const existing = slots.get(key);
    if (existing) issues.push({ id: `${item.id}-overlap`, cargoId: item.id, level: 'high', title: '货位重叠', detail: `${item.id} 与 ${existing.id} 占用相同二维货位。` });
    slots.set(key, item);
    if (item.hazmat !== '无' && item.deck === '主甲板' && item.row <= 1) issues.push({ id: `${item.id}-hazmat`, cargoId: item.id, level: 'high', title: '危险品隔离不足', detail: `${item.id} 与船体边界距离小于方案要求。` });
    if (item.weight > 100 && item.lashing !== '已绑扎') issues.push({ id: `${item.id}-lashing`, cargoId: item.id, level: 'medium', title: '重大件绑扎未完成', detail: `${item.id} 重量 ${item.weight}t，绑扎状态为“${item.lashing}”。` });
    if (item.type === '集装箱' && item.weight > 30 && item.tier >= 3) issues.push({ id: `${item.id}-stack`, cargoId: item.id, level: 'medium', title: '上层堆重超限', detail: `${item.id} 不应放在第 ${item.tier} 层。` });
  });
  return issues;
}
