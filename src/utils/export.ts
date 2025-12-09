import { TransactionPath, SuspiciousPattern, TaintFlow, AddressCluster } from '../types';

/**
 * Export paths to CSV format
 */
export const exportPathsToCSV = (paths: TransactionPath[]): string => {
  const headers = [
    'Path',
    'Hops',
    'Total Amount',
    'Suspicion Score',
    'Start Date',
    'End Date',
    'Avg Delay (hours)',
  ];

  const rows = paths.map(p => [
    p.addresses.join(' → '),
    p.hops.toString(),
    p.totalAmount.toFixed(2),
    p.suspicionScore.toFixed(1),
    p.startDate.toISOString(),
    p.endDate.toISOString(),
    (p.avgDelay / (1000 * 60 * 60)).toFixed(2),
  ]);

  return [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
  ].join('\n');
};

/**
 * Export forensics report to JSON
 */
export const exportForensicsReport = (data: {
  paths?: TransactionPath[];
  patterns?: SuspiciousPattern[];
  taint?: TaintFlow;
  clusters?: AddressCluster[];
}): string => {
  return JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      version: '1.0',
      application: 'CryptoFlow Analytics',
      ...data,
    },
    null,
    2
  );
};

/**
 * Export patterns to CSV
 */
export const exportPatternsToCSV = (patterns: SuspiciousPattern[]): string => {
  const headers = [
    'Type',
    'Severity',
    'Score',
    'Description',
    'Affected Addresses Count',
    'Transactions Count',
  ];

  const rows = patterns.map(p => [
    p.type,
    p.severity,
    p.score.toString(),
    p.description,
    p.affectedAddresses.length.toString(),
    p.transactions.length.toString(),
  ]);

  return [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
  ].join('\n');
};

/**
 * Export taint analysis to CSV
 */
export const exportTaintToCSV = (taint: TaintFlow): string => {
  const headers = [
    'Source',
    'Target',
    'Total Tainted',
    'Taint Percentage',
    'Path',
    'Path Amount',
    'Path Percentage',
  ];

  const rows = taint.paths.map(p => [
    taint.sourceAddress,
    taint.targetAddress,
    taint.totalTainted.toFixed(2),
    taint.taintPercentage.toFixed(2),
    p.path.join(' → '),
    p.amount.toFixed(2),
    p.percentage.toFixed(2),
  ]);

  return [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
  ].join('\n');
};

/**
 * Export clusters to CSV
 */
export const exportClustersToCSV = (clusters: AddressCluster[]): string => {
  const headers = [
    'Cluster ID',
    'Address Count',
    'Common Behavior',
    'Total Volume',
    'Transaction Count',
    'Confidence Score',
  ];

  const rows = clusters.map(c => [
    c.clusterId,
    c.addresses.length.toString(),
    c.commonBehavior,
    c.totalVolume.toFixed(2),
    c.transactionCount.toString(),
    c.confidenceScore.toFixed(2),
  ]);

  return [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
  ].join('\n');
};

/**
 * Download blob as file
 */
export const downloadBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/**
 * Export visualization (SVG) to file
 */
export const exportVisualization = (
  svgElement: SVGElement,
  filename: string,
  format: 'svg' | 'png' = 'svg'
): void => {
  if (format === 'svg') {
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svgElement);
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    downloadBlob(blob, filename);
  } else {
    // Convert SVG to PNG using canvas
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const svgData = new XMLSerializer().serializeToString(svgElement);
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(blob => {
        if (blob) downloadBlob(blob, filename);
      });
    };

    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    img.src = url;
  }
};

/**
 * Export data based on type
 */
export const exportData = (
  data: any,
  type: 'paths' | 'patterns' | 'taint' | 'clusters' | 'json',
  filename?: string
): void => {
  let content: string;
  let extension: string;
  let mimeType: string;

  switch (type) {
    case 'paths':
      content = exportPathsToCSV(data);
      extension = 'csv';
      mimeType = 'text/csv';
      break;
    case 'patterns':
      content = exportPatternsToCSV(data);
      extension = 'csv';
      mimeType = 'text/csv';
      break;
    case 'taint':
      content = exportTaintToCSV(data);
      extension = 'csv';
      mimeType = 'text/csv';
      break;
    case 'clusters':
      content = exportClustersToCSV(data);
      extension = 'csv';
      mimeType = 'text/csv';
      break;
    case 'json':
    default:
      content = exportForensicsReport(data);
      extension = 'json';
      mimeType = 'application/json';
      break;
  }

  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const defaultFilename = `cryptoflow-${type}-${new Date().toISOString().split('T')[0]}.${extension}`;
  downloadBlob(blob, filename || defaultFilename);
};
