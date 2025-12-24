import { ethers } from "ethers";

const LYRA_BASE_URL =
  process.env.LYRA_API_BASE_URL || "https://api.lyra.finance";

// Lyra mainnet constants for action signing
const LYRA_MAINNET = {
  TRADE_ADDRESS: "0xB8D20c2B7a1Ad2EE33Bc50eF10876eD3035b5e7b",
  ACTION_TYPEHASH: "0x4d7a9f27c403ff9c0f19bce61d76d82f9aa29f8d6d4b0c5474607d9770d1af17",
  DOMAIN_SEPARATOR: "0xd96e5f90797da7ec8dc4e276260c7f3f87fedf68775fbe1ef116e996fc60441b",
};

interface LyraAuthConfig {
  sessionPrivateKey: string;
  walletAddress: string;
  subaccountId: string;
}

function getAuthConfig(): LyraAuthConfig {
  const sessionPrivateKey = process.env.LYRA_SESSION_PRIVATE_KEY;
  const walletAddress = process.env.LYRA_WALLET_ADDRESS;
  const subaccountId = process.env.LYRA_SUBACCOUNT_ID;

  if (!sessionPrivateKey || !walletAddress || !subaccountId) {
    throw new Error(
      "Missing Lyra credentials. Set LYRA_SESSION_PRIVATE_KEY, LYRA_WALLET_ADDRESS, and LYRA_SUBACCOUNT_ID"
    );
  }

  return { sessionPrivateKey, walletAddress, subaccountId };
}

function createSessionWallet(): ethers.Wallet {
  const config = getAuthConfig();
  return new ethers.Wallet(config.sessionPrivateKey);
}

// Generate signature for API authentication
async function signMessage(message: string): Promise<string> {
  const wallet = createSessionWallet();
  return wallet.signMessage(message);
}

// Generate authentication headers for private endpoints
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const config = getAuthConfig();
  const timestamp = Date.now().toString();
  const signature = await signMessage(timestamp);

  return {
    "Content-Type": "application/json",
    "X-LyraWallet": config.walletAddress,
    "X-LyraTimestamp": timestamp,
    "X-LyraSignature": signature,
  };
}

interface LyraApiResponse<T> {
  result: T;
  id?: string;
}

interface LyraApiError {
  error: {
    code: number;
    message: string;
  };
}

// Make authenticated private API request
export async function lyraPrivateRequest<T>(
  endpoint: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  const headers = await getAuthHeaders();

  const response = await fetch(`${LYRA_BASE_URL}${endpoint}`, {
    method: "POST",
    headers,
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Lyra API error: ${response.status} - ${text}`);
  }

  const data = (await response.json()) as LyraApiResponse<T> | LyraApiError;

  if ("error" in data) {
    throw new Error(`Lyra API error: ${data.error.message}`);
  }

  return data.result;
}

// Order parameters for Lyra private/order endpoint
export interface OrderParams {
  instrument_name: string;
  direction: "buy" | "sell";
  amount: string;
  limit_price: string;
  max_fee: string;
  order_type: "limit" | "market";
  time_in_force: "gtc" | "ioc" | "fok";
  reduce_only: boolean;
  mmp: boolean;
  subaccount_id: number;
  nonce: number;
  signature_expiry_sec: number;
  signer: string;
}

// Generate nonce - use milliseconds timestamp which fits in safe integer range
// The Lyra API accepts any unique integer as nonce
function getNonce(): number {
  // Use milliseconds + random component to ensure uniqueness
  // This gives values like 1766585055672 which is within safe integer range
  return Date.now() * 1000 + Math.floor(Math.random() * 1000);
}

// Helper to convert decimal string to wei (18 decimals)
function toWei(value: string): bigint {
  const parts = value.split('.');
  const whole = parts[0] || '0';
  const decimal = (parts[1] || '').padEnd(18, '0').slice(0, 18);
  return BigInt(whole + decimal);
}

// Encode trade module data for signing
function encodeTradeModuleData(
  assetAddress: string,
  subId: bigint,
  limitPrice: string,
  amount: string,
  maxFee: string,
  recipientId: number,
  isBid: boolean
): string {
  const encoder = ethers.AbiCoder.defaultAbiCoder();
  return encoder.encode(
    ['address', 'uint256', 'int256', 'int256', 'uint256', 'uint256', 'bool'],
    [
      assetAddress,
      subId,
      toWei(limitPrice),
      toWei(amount),
      toWei(maxFee),
      recipientId,
      isBid,
    ]
  );
}

// Compute action hash for EIP-712 signing
function computeActionHash(
  subaccountId: number,
  nonce: number,
  moduleAddress: string,
  encodedData: string,
  expiry: number,
  ownerAddress: string,
  signerAddress: string
): string {
  const encoder = ethers.AbiCoder.defaultAbiCoder();
  const encodedDataHash = ethers.keccak256(encodedData);
  
  return ethers.keccak256(
    encoder.encode(
      ['bytes32', 'uint256', 'uint256', 'address', 'bytes32', 'uint256', 'address', 'address'],
      [
        LYRA_MAINNET.ACTION_TYPEHASH,
        subaccountId,
        nonce,
        moduleAddress,
        encodedDataHash,
        expiry,
        ownerAddress,
        signerAddress,
      ]
    )
  );
}

// Compute EIP-712 typed data hash
function toTypedDataHash(actionHash: string): string {
  const domainSeparatorBytes = Buffer.from(LYRA_MAINNET.DOMAIN_SEPARATOR.slice(2), 'hex');
  const actionHashBytes = Buffer.from(actionHash.slice(2), 'hex');
  const prefix = Buffer.from('1901', 'hex');
  
  return ethers.keccak256(Buffer.concat([prefix, domainSeparatorBytes, actionHashBytes]));
}

export async function signOrder(
  orderParams: Omit<OrderParams, "nonce" | "signature_expiry_sec" | "signer" | "subaccount_id">,
  assetAddress: string,
  subId: bigint
): Promise<{ order: OrderParams; signature: string }> {
  const config = getAuthConfig();
  const wallet = createSessionWallet();

  const nonce = getNonce();
  const signatureExpirySec = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

  const order: OrderParams = {
    ...orderParams,
    subaccount_id: parseInt(config.subaccountId),
    nonce,
    signature_expiry_sec: signatureExpirySec,
    signer: wallet.address,
  };

  // Encode trade data
  const isBid = orderParams.direction === 'buy';
  const encodedData = encodeTradeModuleData(
    assetAddress,
    subId,
    orderParams.limit_price,
    orderParams.amount,
    orderParams.max_fee,
    parseInt(config.subaccountId),
    isBid
  );

  // Compute action hash
  const actionHash = computeActionHash(
    parseInt(config.subaccountId),
    nonce,
    LYRA_MAINNET.TRADE_ADDRESS,
    encodedData,
    signatureExpirySec,
    config.walletAddress,
    wallet.address
  );

  // Sign the typed data hash
  const typedDataHash = toTypedDataHash(actionHash);
  const signature = wallet.signingKey.sign(typedDataHash).serialized;

  return { order, signature };
}

// Get subaccounts
export interface Subaccount {
  subaccount_id: number;
  label: string;
  margin_type: string;
  portfolio_value: string;
  initial_margin: string;
  maintenance_margin: string;
}

export async function getSubaccounts(): Promise<Subaccount[]> {
  const config = getAuthConfig();
  const result = await lyraPrivateRequest<{ subaccounts: Subaccount[] }>(
    "/private/get_subaccounts",
    { wallet: config.walletAddress }
  );
  return result.subaccounts;
}

// Get positions
export interface Position {
  instrument_name: string;
  amount: string;
  average_price: string;
  mark_price: string;
  unrealized_pnl: string;
  realized_pnl: string;
}

export async function getPositions(subaccountId?: number): Promise<Position[]> {
  const config = getAuthConfig();
  const result = await lyraPrivateRequest<{ positions: Position[] }>(
    "/private/get_positions",
    {
      subaccount_id: subaccountId || parseInt(config.subaccountId),
    }
  );
  return result.positions;
}

// Get margin info
export interface MarginInfo {
  subaccount_id: number;
  initial_margin: string;
  maintenance_margin: string;
  margin_balance: string;
  available_balance: string;
}

export async function getMargin(subaccountId?: number): Promise<MarginInfo> {
  const config = getAuthConfig();
  return lyraPrivateRequest<MarginInfo>("/private/get_margin", {
    subaccount_id: subaccountId || parseInt(config.subaccountId),
  });
}

// Submit order
export interface OrderResponse {
  order_id: string;
  instrument_name: string;
  direction: "buy" | "sell";
  amount: string;
  limit_price: string;
  order_status: string;
  filled_amount: string;
  average_price: string | null;
  creation_timestamp: number;
}

// Fetch instrument details to get asset address and sub_id
async function getInstrumentDetails(instrumentName: string): Promise<{ base_asset_address: string; base_asset_sub_id: string }> {
  const response = await fetch(`${LYRA_BASE_URL}/public/get_instrument`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ instrument_name: instrumentName }),
  });
  
  if (!response.ok) {
    throw new Error(`Failed to get instrument: ${response.statusText}`);
  }
  
  const data = await response.json();
  return {
    base_asset_address: data.result.base_asset_address,
    base_asset_sub_id: data.result.base_asset_sub_id,
  };
}

export async function submitOrder(
  instrumentName: string,
  direction: "buy" | "sell",
  amount: string,
  limitPrice: string,
  maxFee: string = "100" // Default max fee of $100 USDC
): Promise<OrderResponse> {
  // Get instrument details for signing
  const instrumentDetails = await getInstrumentDetails(instrumentName);
  const assetAddress = instrumentDetails.base_asset_address;
  const subId = BigInt(instrumentDetails.base_asset_sub_id);
  
  console.log('[DEBUG] Instrument details:', { assetAddress, subId: subId.toString() });

  const { order, signature } = await signOrder(
    {
      instrument_name: instrumentName,
      direction,
      amount,
      limit_price: limitPrice,
      max_fee: maxFee,
      order_type: "limit",
      time_in_force: "gtc",
      reduce_only: false,
      mmp: false,
    },
    assetAddress,
    subId
  );

  const payload = {
    ...order,
    signature,
  };
  
  console.log('[DEBUG] Submitting order to Lyra:', JSON.stringify(payload, null, 2));

  const response = await lyraPrivateRequest<OrderResponse>("/private/order", payload);
  console.log('[DEBUG] Lyra order response:', JSON.stringify(response, null, 2));
  return response;
}

// Cancel order
export async function cancelOrder(orderId: string): Promise<{ success: boolean }> {
  return lyraPrivateRequest<{ success: boolean }>("/private/cancel", {
    order_id: orderId,
  });
}

