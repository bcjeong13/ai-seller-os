// ============================================================
// AI Seller OS — 도메인 타입 (국내 위탁판매)
// 모든 금액 단위: 원(KRW), 정수. 계산은 100% 코드로만.
// ※ 해외 소싱(관세·환율·통관)은 범위 밖.
// ============================================================

/** 판매 마켓 */
export type Marketplace = "NAVER" | "COUPANG" | "11ST" | "GMARKET" | "AUCTION" | "OTHER";

/** 등록 필요 시 순회할 전체 채널 목록 */
export const ALL_CHANNELS: Marketplace[] = ["NAVER", "COUPANG", "11ST", "GMARKET", "AUCTION"];

/** 상품 상태 */
export type ProductStatus =
  | "DRAFT"        // 심사 전
  | "APPROVED"     // 등록 승인
  | "SELLING"
  | "WARNING"
  | "DANGER"
  | "LOSS"
  | "BLOCKED"
  | "OUT_OF_STOCK"
  | "DISCONTINUED";

/** 손익 위험 등급 */
export type RiskGrade = "SAFE" | "WARNING" | "DANGER" | "LOSS" | "BLOCKED";

/** 상품 종합 상태 — 점수 대신 3단계 (개발지시서 §10) */
export type HealthLevel = "STABLE" | "ATTENTION" | "RISK";

/** 도매처 재고 상태 — 셀러 재고와 절대 분리 */
export type SupplierStock =
  | "IN_STOCK"
  | "LOW_STOCK"
  | "OUT_OF_STOCK"
  | "UNKNOWN"
  | "DATA_UNAVAILABLE";

/** 데이터 신선도 — 공급처 정보를 확인한 지 얼마나 됐나 */
export type Freshness = "HIGH" | "MEDIUM_HIGH" | "MEDIUM" | "LOW";

/** 손익 시나리오 3단 */
export type Scenario = "OPTIMISTIC" | "EXPECTED" | "CONSERVATIVE";

// ------------------------------------------------------------
// 수수료 — 다차원 구조 (단일 % 로 단순화하지 않는다)
// ------------------------------------------------------------

/** 수수료 부과 기준 */
export type FeeBasis =
  | "PRODUCT"          // 상품금액(구매자 결제금액) 기준
  | "SHIPPING"         // 배송비 기준
  | "RETURN_SHIPPING"; // 반품배송비 기준

export interface FeeRule {
  id: string;
  /** 화면에 보이는 이름 — 예: "판매수수료", "결제·주문관리 수수료" */
  label: string;
  basis: FeeBasis;
  pct: number;
  enabled: boolean;
  /** 사용자가 실제 요율을 확인했는지 — 미확인이면 화면에 "예시값" 표시 */
  verified: boolean;
}

/** 마켓별 수수료 규칙 묶음 */
export interface MarketFeeProfile {
  marketplace: Marketplace;
  rules: FeeRule[];
}

// ------------------------------------------------------------
// 판매가 — 4단계 분리
// ------------------------------------------------------------

export interface PriceBreakdown {
  /** 정상 판매가 */
  listPriceKrw: number;
  /** 즉시할인 등 할인 금액 */
  discountKrw: number;
  /** 구매자 실제 결제금액 = 정상가 − 할인. 수수료 계산 기준이 될 수 있음 */
  buyerPaidKrw: number;
  /** 고객이 부담한 배송비 (셀러 매출로 잡히는 경우) */
  buyerShippingKrw: number;
  /** 실제 정산금액 — 정산 확인 후 입력 (선택) */
  settledKrw?: number;
}

// ------------------------------------------------------------
// 원가
// ------------------------------------------------------------

/** 반품 비용 모델 — 고정값이 아니라 (실부담액 × 반품률) */
export interface ReturnModel {
  /** 반품 1건 발생 시 실제 부담액 (도매처가 청구하는 반품배송비) */
  costPerReturnKrw: number;
  /** 교환 1건 발생 시 부담액 — 보통 반품비의 2배 */
  exchangeCostKrw: number;
  /** 반품률 (%) */
  ratePct: number;
  /** 실측값인지 여부 — false면 추정치, 운영하며 실측으로 대체 */
  measured: boolean;
  /** 실측 근거 (반품 건수 / 주문 건수) */
  sampleReturns?: number;
  sampleOrders?: number;
}

/** 상품 스펙 — 한 번 가져오면 다시 입력하지 않는다 */
export interface ProductSpec {
  key: string;
  value: string;
}

/**
 * 공급처(도매처)의 반품/교환 정책.
 * ★ 이것은 "공급처가 셀러에게 주는 정책"이지 "셀러가 고객에게 주는 정책"이 아니다.
 *   상세페이지에 쓰려면 사용자가 명시적으로 확인·승인해야 한다.
 */
export interface ReturnPolicy {
  /** 무료 반품 가능 일수 (없으면 undefined) */
  freeReturnDays?: number;
  /** 하자 무상 반품 가능 일수 */
  defectReturnDays?: number;
  /** 반품 배송비 (원) */
  returnFeeKrw?: number;
  /** 교환 배송비 (원) */
  exchangeFeeKrw?: number;
  /** 원문 — 사용자가 직접 확인할 수 있도록 보관 */
  rawText?: string;
  source: "supplier" | "manual";
  sourceUrl?: string;
  capturedAt: number;
  /** 사용자가 고객용 정책으로 쓰겠다고 확인했는가 */
  approvedForCustomer: boolean;
}

/**
 * 판매자 반품/교환 정책 — 고객에게 안내하는 내용.
 * 공급처 정책(ReturnPolicy)과 분리해서 관리한다. 값이 없으면 법정 기준으로 안내한다.
 */
export interface SellerReturnPolicy {
  /** 청약철회 기간(일). 전자상거래법상 최소 7일 — 그보다 짧게 잡을 수 없다 */
  withdrawalDays: number;
  /** 반품 배송비 — 고객이 부담하는 금액 */
  returnShippingKrw: number;
  /** 교환 배송비 */
  exchangeShippingKrw: number;
  /** 반품이 불가능한 경우 (직접 작성) */
  exceptions?: string;
  /** 공급처 정책을 참고해서 정했는가 — 화면에 차이를 보여주기 위한 표시 */
  basedOnSupplier: boolean;
  updatedAt: number;
}

/** 등록 승인 기록 — 누가 언제 무엇을 확인했는가 */
export interface ListingApproval {
  approvedAt: number;
  /** 승인 시점의 판매가 — 이후 가격이 바뀌면 승인을 무효로 본다 */
  approvedPriceKrw: number;
  /** 사람만 확인할 수 있는 항목들 */
  imageChecked: boolean;
  wordingChecked: boolean;
  /** 승인 당시 상세설명 (나중에 바뀌었는지 비교용) */
  htmlHash?: string;
}

/** 시장 조사 가격 — 1단계는 사용자가 직접 입력 */
export interface MarketPrice {
  /** 검색에 쓴 키워드 */
  keyword: string;
  lowestKrw: number;
  /** 대표(중간) 가격 — 판단의 기준 */
  typicalKrw: number;
  highestKrw?: number;
  /** 무료배송 기준 최저가 (선택) — 배송비 별도 상품과 섞이지 않게 */
  lowestFreeShipKrw?: number;
  source: "manual" | "extension";
  checkedAt: number;
  note?: string;
}

/** 원가 구성요소 */
export interface CostInputs {
  /** 도매 공급가 (원) — 1개 단가 */
  supplyPriceKrw: number;
  /**
   * 도매처의 최소구매수량. 기본 1.
   * ★ 2 이상이면 고객이 1개를 사도 나는 그만큼 사야 한다.
   *   원가는 (단가 × 이 수량)이다. 넣지 않으면 원가가 실제보다 싸게 나온다.
   */
  minOrderQty?: number;
  /** 배송비 (원) — 도매처가 셀러에게 청구 */
  shippingKrw: number;
  /** 반품 모델 */
  returnModel: ReturnModel;
  /** 예상 CS 비용 (원, 주문당 충당) */
  csCostKrw: number;
  /** 광고비 (원, 주문당 배분) */
  adCostKrw: number;
}

/** 원가 변동 이력 1건 */
export interface CostHistoryEntry {
  at: number;
  supplyPriceKrw: number;
  shippingKrw: number;
  /** 파생: 공급가 + 배송비 */
  landedCostKrw: number;
  note?: string;
}

/** 이벤트 로그 — 개인정보 원문을 절대 담지 않는다 (지시서 §7-4) */
export interface EventLog {
  at: number;
  type: string;
  message: string;
}

// ------------------------------------------------------------
// 옵션
// ------------------------------------------------------------

/** 상품 옵션 1개 — 옵션마다 공급가·배송비가 다를 수 있다 */
export interface ProductOption {
  id: string;
  /** 예: "블랙 / L" */
  name: string;
  supplyPriceKrw: number;
  /** 이 옵션에만 다르게 붙는 배송비. 미지정이면 상품 기본 배송비 사용 */
  shippingKrw?: number;
  /** 판매가 추가금 (옵션가) */
  addPriceKrw: number;
  supplierStock: SupplierStock;
  /** 판매 중인 옵션인지 (역마진 옵션은 끄면 됨) */
  enabled: boolean;
}

// ------------------------------------------------------------
// 상세페이지 초안
// ------------------------------------------------------------

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
  updatedAt: number;
}

/** 마켓별 등록 진행 상태 */
export interface ChannelListing {
  marketplace: Marketplace;
  /** 실제 등록 완료 여부 */
  listed: boolean;
  /** 검토 후 등록 대기 (주로 네이버) */
  pending: boolean;
  listedAt?: number;
  /** 마켓에서 발급된 상품번호 (선택) */
  marketProductNo?: string;
}

// ------------------------------------------------------------
// 상품
// ------------------------------------------------------------

export interface Product {
  id: string;
  name: string;
  /** 도매 소싱 상품 URL */
  sourceUrl: string;
  /** 도매처/공급사 이름 */
  supplierName: string;
  /** 손익 기준으로 삼을 마켓 (가장 수수료 높은 곳) */
  marketplace: Marketplace;

  /** 대표 판매가 구성 */
  price: PriceBreakdown;

  /** 대표(기본) 원가 */
  cost: CostInputs;
  /** 등록 당시 원가 (비교용) */
  baselineCost: CostInputs;

  /** 옵션 목록 — 비어 있으면 단일 상품 */
  options: ProductOption[];

  supplierStock: SupplierStock;
  /** 셀러 실보유 재고 — 위탁배송은 항상 0 */
  sellerInventory: number;

  minMarginPct: number;
  minProfitKrw: number;

  /** 판매 차단 (KC 미인증·상표권·판매금지 등) */
  legalBlock: boolean;
  legalNote?: string;

  /** 공급사가 상세 이미지 사용을 허용했는지 확인함 */
  imageRightsConfirmed: boolean;

  /** 스펙 (소재·중량 등) — 확장에서 가져온 것을 그대로 보관 */
  specs: ProductSpec[];

  /** 공급처 반품/교환 정책 — 도매처가 나에게 해주는 것 */
  supplierReturnPolicy?: ReturnPolicy;

  /**
   * 판매자 반품/교환 정책 — 내가 고객에게 약속하는 것.
   * ★ 공급처 정책과 절대 같지 않다. 공급처가 정책을 바꿔도
   *   나는 이미 고객에게 약속한 상태이고, 법적 책임은 판매자인 나에게 있다.
   */
  sellerReturnPolicy?: SellerReturnPolicy;

  /**
   * 상품정보제공고시 — 사용자가 직접 입력한 값만 담는다.
   * 도매처 스펙에서 자동으로 읽히는 것은 저장하지 않는다 (notice.ts가 매번 채운다).
   */
  noticeInfo?: Record<string, string>;

  /** 등록 승인 — AI가 만든 내용을 사람이 확인했는가 */
  listingApproval?: ListingApproval;

  /** 시장 조사 가격 */
  marketPrice?: MarketPrice;

  status: ProductStatus;

  /** 마켓별 등록 진행 */
  listings: ChannelListing[];

  /** 마지막 공급처 확인 시각(ms) */
  lastCollectedAt: number;
  createdAt: number;

  costHistory: CostHistoryEntry[];
  events: EventLog[];

  detailDraft?: DetailDraft;
}

// ------------------------------------------------------------
// 손익 결과
// ------------------------------------------------------------

export interface FeeBreakdownLine {
  label: string;
  basis: FeeBasis;
  pct: number;
  amountKrw: number;
}

export interface ProfitResult {
  /** 계산 기준이 된 구매자 결제금액 */
  buyerPaidKrw: number;
  supplyPriceKrw: number;
  /** 매입 합계 = 공급가 + 배송비 */
  landedCostKrw: number;
  /** 수수료 상세 */
  feeLines: FeeBreakdownLine[];
  totalFeeKrw: number;
  /** 반품 충당금 = 1건 부담액 × 반품률 */
  returnReserveKrw: number;
  csCostKrw: number;
  adCostKrw: number;
  /** 셀러 총원가 */
  sellerCostKrw: number;
  netProfitKrw: number;
  marginPct: number;
  breakEvenPriceKrw: number;
}

/** 시나리오 3단 결과 */
export interface ScenarioProfit {
  optimistic: ProfitResult;
  expected: ProfitResult;
  /** 발주 판단은 이 값을 기준으로 한다 */
  conservative: ProfitResult;
}

/** 옵션별 손익 1건 */
export interface OptionProfit {
  optionId: string;
  optionName: string;
  enabled: boolean;
  supplyPriceKrw: number;
  sellingPriceKrw: number;
  profit: ProfitResult;
  grade: RiskGrade;
}

/** 상품 전체 옵션 요약 */
export interface OptionProfitSummary {
  lines: OptionProfit[];
  /** 역마진(순이익 < 0) 옵션 수 */
  lossCount: number;
  /** 최소 마진 미달 옵션 수 */
  belowMinCount: number;
  totalCount: number;
  worst?: OptionProfit;
}
