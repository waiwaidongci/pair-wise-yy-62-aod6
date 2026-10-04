import { createApi } from '@reduxjs/toolkit/query/react';
import type { BaseQueryFn } from '@reduxjs/toolkit/query';

export type CargoType = '集装箱' | '散货' | '重大件';
export type Cargo = {
  id: string;
  bill: string;
  type: CargoType;
  bay: number;
  row: number;
  tier: number;
  deck: '主甲板' | '货舱';
  /** 配载与稳性计算实际采用的重量（复磅完成后以复磅值为准） */
  weight: number;
  /** 货主申报箱重 */
  declaredWeight: number;
  /** 码头复磅值，未复磅为 null */
  weighedWeight: number | null;
  /** 重量依据：申报值 / 复磅值 */
  weightBasis: '申报' | '复磅';
  /** 复磅状态：待复磅 / 已复磅 / 容差外 */
  weighStatus: '待复磅' | '已复磅' | '容差外';
  /** 所属复磅批次号 */
  batchId: string | null;
  dimension: string;
  port: string;
  hazmat: string;
  lashing: '已绑扎' | '待绑扎' | '需复核';
  color: string;
};

const voyageData = {
  id: 'V-2609-17',
  vessel: '海岳轮',
  imo: 'IMO 9782214',
  route: '上海 → 釜山 → 温哥华',
  departure: '2026-10-02 14:00',
  revision: 5,
  cargo: [
    { id: 'BL-88214', bill: 'SEA-88214', type: '集装箱', bay: 12, row: 4, tier: 2, deck: '主甲板', weight: 25.8, declaredWeight: 24.6, weighedWeight: 25.8, weightBasis: '复磅', weighStatus: '已复磅', batchId: 'WB-2609-01', dimension: '40 × 8 × 8.6 ft', port: '温哥华', hazmat: '无', lashing: '已绑扎', color: '#2b7c75' },
    { id: 'BL-88219', bill: 'SEA-88219', type: '集装箱', bay: 13, row: 4, tier: 2, deck: '主甲板', weight: 31.2, declaredWeight: 28.1, weighedWeight: 31.2, weightBasis: '复磅', weighStatus: '容差外', batchId: 'WB-2609-01', dimension: '40 × 8 × 8.6 ft', port: '温哥华', hazmat: 'UN 1263', lashing: '需复核', color: '#c77835' },
    { id: 'BL-88231', bill: 'SEA-88231', type: '集装箱', bay: 10, row: 6, tier: 1, deck: '主甲板', weight: 18.2, declaredWeight: 18.2, weighedWeight: null, weightBasis: '申报', weighStatus: '待复磅', batchId: null, dimension: '20 × 8 × 8.6 ft', port: '釜山', hazmat: '无', lashing: '已绑扎', color: '#366d94' },
    { id: 'BL-88240', bill: 'SEA-88240', type: '集装箱', bay: 8, row: 2, tier: 2, deck: '货舱', weight: 31.4, declaredWeight: 31.4, weighedWeight: null, weightBasis: '申报', weighStatus: '待复磅', batchId: null, dimension: '40 × 8 × 8.6 ft', port: '温哥华', hazmat: '无', lashing: '待绑扎', color: '#6d528d' },
    { id: 'BL-88247', bill: 'SEA-88247', type: '重大件', bay: 15, row: 0, tier: 1, deck: '主甲板', weight: 118.6, declaredWeight: 112.5, weighedWeight: 118.6, weightBasis: '复磅', weighStatus: '容差外', batchId: 'WB-2609-02', dimension: '18.4 × 4.2 × 4.8 m', port: '温哥华', hazmat: '无', lashing: '需复核', color: '#b64f49' },
    { id: 'BL-88254', bill: 'SEA-88254', type: '散货', bay: 5, row: 0, tier: 0, deck: '货舱', weight: 279.5, declaredWeight: 286.0, weighedWeight: 279.5, weightBasis: '复磅', weighStatus: '已复磅', batchId: 'WB-2609-02', dimension: '散装 / 420 m³', port: '釜山', hazmat: '无', lashing: '已绑扎', color: '#9a7836' }
  ] as Cargo[]
};

const mockBaseQuery: BaseQueryFn = async (arg) => {
  await new Promise((resolve) => setTimeout(resolve, 180));
  if (arg === 'voyage' || (typeof arg === 'object' && arg && 'url' in arg && (arg as { url: string }).url === 'voyage')) return { data: voyageData };
  return { error: { status: 404, data: 'Not found' } };
};

export const stowageApi = createApi({
  reducerPath: 'stowageApi',
  baseQuery: mockBaseQuery,
  tagTypes: ['Voyage'],
  endpoints: (builder) => ({
    getVoyage: builder.query<typeof voyageData, void>({ query: () => 'voyage', providesTags: ['Voyage'] })
  })
});

export const { useGetVoyageQuery } = stowageApi;
