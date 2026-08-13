// ============================================================
// AI Seller OS — 도메인 타입 (무재고 구매대행 모델)
// 모든 금액 단위: 원(KRW), 정수. 계산은 100% 코드로만.
// ============================================================

/** 판매 마켓 */
export type Marketplace = "NAVER" | "COUPANG" | "11ST" | "GMARKET" | "AUCTION" | "OTHER";

/** 등록 필요 시 순회할 전체 채널 목록 */
export const ALL_CHANNELS: Marketplace[] = ["NAVER", "COUPANG", "11ST", "GMARKET", "AUCTION"];

/** 소싱처 통화 */
export type Currency = "KRW" | "CNY" | "USD";

/** 상품 상태 (프롬프트 §6/§34) */
export type ProductStatus =
  | "DISCOVERED"
  | "ANALYZING"
  | "APPROVED"
  | "LISTED"
  | "SELLING"
  | "WARNING"
  | "DANGER"
  | "LOSS"
  | "BLOCKED"
  | "OUT_OF_STOCK"
  | "DISCONTINUED";

/** 손익 위험 등급 */
export type RiskGrade = "SAFE" | "WARNING" | "DANGER" | "LOSS" | "BLOCKED";

/** 공급처(1688) 재고 상태 — SELLER_INVENTORY와 절대 분리 */
export type SupplierStock =
  | "IN_STOCK"
  | "LOW_STOCK"
  | "OUT_OF_STOCK"
  | "UNKNOWN"
  | "DATA_UNAVAILABLE";

/** 데이터 신선도 */
export type Freshness = "HIGH" | "MEDIUM_HIGH" | "MEDIUM" | "LOW";

/** ORDER_PREFLIGHT_CHECK 결과 상태 (프롬프트 §2) */
export type PreflightStatus =
  | "ORDERABLE"
  | "ORDERABLE_WITH_WARNING"
  | "PENDING_APPROVAL"
  | "BLOCKED"
  | "OUT_OF_STOCK"
  | "LOSS_RISK"
  | "DATA_UNAVAILABLE";

/** 원가 구성요소 — 각각 독립 감시(프롬프트 §5) */
export interface CostInputs {
  /** 소싱처 통화 (KRW/CNY/USD) */
  sourceCurrency: Currency;
  /** 소싱처 표기 상품가 (해당 통화 기준) */
  sourcePrice: number;
  /** 환율 (원/소싱통화 1단위). KRW면 1. */
  exchangeRate: number;
  /** 국제배송비 (원) — 면세 판정 시 물품가격과 분리 */
  internationalShippingKrw: number;
  /** 해외 결제/송금 수수료 (%) — 해외구매액 기준 */
  paymentFeePct: number;
  /** 플랫폼 수수료 (%) — 판매가 기준 */
  platformFeePct: number;
  /** 국내 결제 수수료 (%) — 판매가 기준 */
  domesticPaymentFeePct: number;
  /** 예상 반품 비용 (원, 주문당 충당) */
  returnCostKrw: number;
  /** 예상 CS 비용 (원, 주문당 충당) */
  csCostKrw: number;
  /** 광고비 (원, 주문당 배분) */
  adCostKrw: number;
}

/** 원가 변동 이력 1건 */
export interface CostHistoryEntry {
  at: number; // ms timestamp
  sourcePrice: number;
  sourceCurrency: Currency;
  exchangeRate: number;
  internationalShippingKrw: number;
  productPriceKrw: number; // 파생: 물품가 원화
  note?: string;
}

/** 이벤트 로그 1건 (프롬프트 §60) */
export interface EventLog {
  at: number;
  type: string;
  message: string;
}

/** 상세페이지 작성 초안 (상품에 저장 — 다시 열어 수정) */
export interface DetailDraft {
  category: string;
  target: string;
  features: string[];
  options: string[];
  freeShipping: boolean;
  returnEnabled: boolean;
  returnDays: number;
  freeReturn: boolean;
  exchange: boolean;
  qualityGuarantee: boolean;
  gift: string;
  deliveryMinDays: number;
  deliveryMaxDays: number;
  isOverseasAgent: boolean;
  updatedAt: number;
}

/** 상품 (국내 마켓에 올린 판매 상품) */
export interface Product {
  id: string;
  name: string;
  sourceUrl: string;
  marketplace: Marketplace;

  /** 국내 판매가 (고객 결제액) */
  sellingPriceKrw: number;

  /** 현재 원가 구성 */
  cost: CostInputs;
  /** 등록 당시 원가 구성 (비교용) */
  baselineCost: CostInputs;

  /** 공급처 재고 상태 */
  supplierStock: SupplierStock;
  /** 셀러 실보유 재고 — 구매대행은 기본 0 */
  sellerInventory: number;

  /** 최소 허용 순이익률(%) */
  minMarginPct: number;
  /** 최소 허용 순이익(원) */
  minProfitKrw: number;

  /** 법적/통관 차단 여부(짝퉁·KC·목록통관 배제 등) */
  legalBlock: boolean;
  legalNote?: string;

  /** 관부가세 면세 기준(물품가격, 원) — 기본 200,000 ≈ $150 */
  customsThresholdKrw: number;
  /** 관세율(%) — 품목별, 기본 8 */
  dutyRatePct: number;

  status: ProductStatus;

  /** 실제 등록(업로드)한 판매 채널 목록 */
  channels: Marketplace[];

  /** 마지막 공급처 데이터 수집 시각(ms) */
  lastCollectedAt: number;
  createdAt: number;

  costHistory: CostHistoryEntry[];
  events: EventLog[];

  /** 상세페이지 작성 초안 (선택) */
  detailDraft?: DetailDraft;
}

/** 관부가세 계산 결과 */
export interface CustomsResult {
  /** 면세 초과 여부 (물품가격 기준) */
  overThreshold: boolean;
  productPriceKrw: number;
  thresholdKrw: number;
  /** 추정 관세(원) — 고객 부담 */
  estimatedDutyKrw: number;
  /** 추정 부가세(원) — 고객 부담 */
  estimatedVatKrw: number;
  /** 고객 예상 추가 부담 합계(원) */
  customerTaxBurdenKrw: number;
  note: string;
}

/** 손익 계산 결과 (100% 결정론적) */
export interface ProfitResult {
  sellingPriceKrw: number;
  /** 물품가 원화 (= sourcePrice × exchangeRate) */
  productPriceKrw: number;
  /** 해외 결제/송금 수수료(원) */
  paymentFeeKrw: number;
  /** 플랫폼 수수료(원) */
  platformFeeKrw: number;
  /** 국내 결제 수수료(원) */
  domesticPaymentFeeKrw: number;
  /** 셀러 총원가(원) */
  sellerCostKrw: number;
  /** 순이익(원) */
  netProfitKrw: number;
  /** 순이익률(%) */
  marginPct: number;
  /** 손익분기 판매가(원) */
  breakEvenPriceKrw: number;
  /** 구매대행 수수료(원) = 부가세 과세표준 후보 */
  agencyFeeKrw: number;
  customs: CustomsResult;
}
