import { jsPDF } from 'jspdf';

export interface PdfCliente {
  nome?: string;
  cnpj?: string;
  telefone?: string;
}

export interface PdfBudget {
  id: string;
  date: string;
  cliente?: PdfCliente;
  origem: string;
  destino: string;
  km: number;
  peso: number;
  valorFrete: number;
  pedagio: number;
  valorTotal: number;
}

const PURPLE: [number, number, number] = [123, 47, 190];
const PURPLE_DARK: [number, number, number] = [90, 32, 139];
const ORANGE: [number, number, number] = [255, 107, 0];
const GREEN: [number, number, number] = [47, 167, 126];
const GRAY: [number, number, number] = [100, 116, 139];
const LIGHT: [number, number, number] = [245, 247, 250];
const BORDER: [number, number, number] = [226, 232, 240];
const INK: [number, number, number] = [30, 41, 59];

export function formatBRL(v: number): string {
  return 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function generateBudgetPdf(b: PdfBudget): { dataUri: string; fileName: string } {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = 595;
  const H = 842;

  doc.setFillColor(...PURPLE);
  doc.rect(0, 0, W, 100, 'F');
  doc.setFillColor(...ORANGE);
  doc.rect(0, 100, W, 6, 'F');
  doc.setFillColor(...GREEN);
  doc.rect(0, 106, W, 3, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(28);
  doc.setTextColor(255, 255, 255);
  doc.text('NEXLOG', 36, 48);
  const nw = doc.getTextWidth('NEXLOG ');
  doc.setTextColor(...ORANGE);
  doc.text('EXPRESS', 36 + nw, 48);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(216, 210, 226);
  doc.text('Logistica & Transporte de Cargas', 36, 70);

  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('ORCAMENTO DE FRETE', W / 2, 150, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(...GRAY);
  doc.text('Nº ' + b.id, W - 36, 138, { align: 'right' });
  doc.text('Data: ' + b.date, W - 36, 156, { align: 'right' });

  const line1 = W - 36 - doc.getTextWidth('Nº ' + b.id) - 12;
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(1);
  doc.line(line1, 130, W - 36, 130);

  let y = 190;

  const sectionHeader = (title: string) => {
    doc.setFillColor(...PURPLE);
    doc.roundedRect(36, y - 8, 12, 12, 3, 3, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(...PURPLE_DARK);
    doc.text(title, 56, y + 4);
    y += 46;
  };

  const labelValue = (label: string, value: string, valueColor?: [number, number, number]) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    doc.setTextColor(...GRAY);
    doc.text(label, 52, y);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...(valueColor || INK));
    doc.text(value, W - 52, y, { align: 'right' });
    y += 30;
  };

  const cardBg = (contentHeight: number) => {
    const startY = y - 14;
    doc.setFillColor(...LIGHT);
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(1);
    doc.roundedRect(36, startY - 14, W - 72, contentHeight + 28, 8, 8, 'FD');
    y += 14;
  };

  if (b.cliente?.nome) {
    sectionHeader('CLIENTE');
    const rows = 1 + (b.cliente!.cnpj ? 1 : 0) + (b.cliente!.telefone ? 1 : 0);
    cardBg(rows * 30);
    labelValue('Nome', b.cliente!.nome || '-');
    if (b.cliente!.cnpj) labelValue('CNPJ/CPF', b.cliente!.cnpj);
    if (b.cliente!.telefone) labelValue('Telefone', b.cliente!.telefone);
  }

  const origemTxt = b.origem && b.origem.trim() ? b.origem.trim() : '—';
  const destinoTxt = b.destino && b.destino.trim() ? b.destino.trim() : '—';
  sectionHeader('ROTA');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  const rotaMax = W - 52 - 60;
  const deLines: string[] = doc.splitTextToSize(origemTxt, rotaMax);
  const paraLines: string[] = doc.splitTextToSize(destinoTxt, rotaMax);
  const nDe = deLines.length;
  const nPara = paraLines.length;
  cardBg((nDe + nPara) * 28);
  const deLabel = 'De:';
  let ry = y + 4;
  const rotaIndent = 52 + doc.getTextWidth(deLabel) + 6;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...INK);
  doc.text(deLabel, 52, ry);
  doc.setFont('helvetica', 'normal');
  doc.text(deLines[0], rotaIndent, ry);
  for (let i = 1; i < nDe; i++) doc.text(deLines[i], rotaIndent, ry + i * 28);
  ry += nDe * 28;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...ORANGE);
  doc.text('»', 52, ry);
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'normal');
  doc.text(paraLines[0], 52 + 24, ry);
  for (let i = 1; i < nPara; i++) doc.text(paraLines[i], 52 + 24, ry + i * 28);
  y += (nDe + nPara) * 28;

  sectionHeader('DETALHES');
  cardBg((1 + (b.peso > 0 ? 1 : 0)) * 30);
  labelValue('KM Total', b.km.toFixed(1) + ' km');
  if (b.peso > 0) labelValue('Peso', b.peso.toLocaleString('pt-BR') + ' kg');

  sectionHeader('PRECO');
  cardBg(3 * 30);
  labelValue('Valor do Frete', formatBRL(b.valorFrete));
  labelValue('Pedagios', formatBRL(b.pedagio));
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(1);
  doc.line(50, y - 15, W - 50, y - 15);
  labelValue('VALOR TOTAL', formatBRL(b.valorTotal), GREEN);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...GRAY);
  y += 8;
  doc.text('Validade do orcamento: 7 dias', 36, y);
  doc.text('Obrigado pela confianca!', 36, y + 20);

  doc.setFillColor(...PURPLE);
  doc.rect(0, H - 52, W, 52, 'F');
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text('NEXLOG EXPRESS', 36, H - 34);
  doc.setFontSize(8);
  doc.setTextColor(216, 210, 226);
  doc.text('nexlogexpress@gmail.com  ·  (19) 98808-7838', 36, H - 18);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...ORANGE);
  doc.text('Sua rota, seu jeito.', W - 36, H - 34, { align: 'right' });

  const dataUri = doc.output('datauristring');
  return { dataUri, fileName: 'Orcamento_NEXLOG_' + b.id + '.pdf' };
}
