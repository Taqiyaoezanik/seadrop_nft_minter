// No external imports needed

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function mintStarted(params: {
  collectionName: string;
  contractAddress: string;
  quantity: number;
  mintPriceEth: string;
  maxGasEth: string;
  walletAddress: string;
  jobId: string;
}): string {
  return (
    `🚀 <b>Mint Job Started</b>\n\n` +
    `Collection: <b>${params.collectionName}</b>\n` +
    `Contract: <code>${params.contractAddress}</code>\n` +
    `Quantity: <b>${params.quantity}</b>\n` +
    `Mint Price: <b>${params.mintPriceEth} ETH</b>\n` +
    `Max Gas: <b>${params.maxGasEth} ETH</b>\n` +
    `Wallet: <code>${shortAddress(params.walletAddress)}</code>\n` +
    `Job ID: <code>${params.jobId}</code>`
  );
}

export function mintSuccess(params: {
  collectionName: string;
  tokenIds: string[];
  mintPriceEth: string;
  gasUsedEth: string;
  txHash: string;
  walletAddress: string;
}): string {
  const tokenDisplay = params.tokenIds.length > 0
    ? params.tokenIds.join(', ')
    : 'N/A';
  return (
    `✅ <b>Mint Successful</b>\n\n` +
    `Collection: <b>${params.collectionName}</b>\n` +
    `Token ID(s): <b>${tokenDisplay}</b>\n` +
    `Mint Price: <b>${params.mintPriceEth} ETH</b>\n` +
    `Gas Used: <b>${parseFloat(params.gasUsedEth).toFixed(6)} ETH</b>\n` +
    `Tx Hash: <code>${params.txHash}</code>\n` +
    `Explorer: <a href="https://etherscan.io/tx/${params.txHash}">View on Etherscan</a>\n` +
    `Wallet: <code>${shortAddress(params.walletAddress)}</code>`
  );
}

export function mintFailed(params: {
  collectionName: string;
  reason: string;
  jobId: string;
  walletAddress: string;
}): string {
  return (
    `❌ <b>Mint Failed</b>\n\n` +
    `Collection: <b>${params.collectionName}</b>\n` +
    `Reason: ${params.reason}\n` +
    `Wallet: <code>${shortAddress(params.walletAddress)}</code>\n` +
    `Job ID: <code>${params.jobId}</code>`
  );
}

export function mintDropped(params: {
  collectionName: string;
  txHash: string;
  jobId: string;
  walletAddress: string;
}): string {
  return (
    `⏳ <b>Mint Dropped (Timeout)</b>\n\n` +
    `Collection: <b>${params.collectionName}</b>\n` +
    `Tx Hash: <code>${params.txHash}</code>\n` +
    `Explorer: <a href="https://etherscan.io/tx/${params.txHash}">View on Etherscan</a>\n` +
    `Wallet: <code>${shortAddress(params.walletAddress)}</code>\n` +
    `Job ID: <code>${params.jobId}</code>\n\n` +
    `Transaction was not confirmed within the timeout period. Check Etherscan for status.`
  );
}

export function notifyLowBalance(params: {
  address: string;
  balanceEth: string;
  thresholdEth: string;
}): string {
  return (
    `⚠️ <b>Low Balance Warning</b>\n\n` +
    `Wallet: <code>${params.address}</code>\n` +
    `Balance: <b>${parseFloat(params.balanceEth).toFixed(6)} ETH</b>\n` +
    `Threshold: <b>${params.thresholdEth} ETH</b>\n\n` +
    `Please top up this wallet to continue minting.`
  );
}
