import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { SchoolData, Student, Contract, Payment, Class } from '../types';
import { getImageDimensions } from './imageService';

/**
 * Helper to calculate proportional dimensions and add image to PDF
 */
const addImageProportional = async (doc: any, src: string, x: number, y: number, maxW: number, maxH: number) => {
  try {
    const { width, height } = await getImageDimensions(src);
    const ratio = width / height;

    let finalW = maxW;
    let finalH = maxW / ratio;

    if (finalH > maxH) {
      finalH = maxH;
      finalW = maxH * ratio;
    }

    // Center in the box
    const offsetX = (maxW - finalW) / 2;
    const offsetY = (maxH - finalH) / 2;

    let format = 'JPEG';
    const lowerSrc = src.toLowerCase();
    if (lowerSrc.includes('png')) format = 'PNG';
    else if (lowerSrc.includes('webp')) format = 'WEBP';

    doc.addImage(src, format, x + offsetX, y + offsetY, finalW, finalH, undefined, 'FAST');
    return { width: finalW, height: finalH };
  } catch (e) {
    console.warn("Image failed to load in PDF", e);
    return null;
  }
};

/**
 * Helper to process and add a 3x4 student photo with center crop and compression
 */
const addStudentPhoto3x4 = async (doc: any, src: string, x: number, y: number) => {
  return new Promise<{ width: number, height: number } | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      // 300x400 for 300 DPI approx (30mm x 40mm)
      const targetW = 354; // 30mm at 300 DPI is approx 354px
      const targetH = 472; // 40mm at 300 DPI is approx 472px

      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }

      const imgRatio = img.width / img.height;
      const targetRatio = targetW / targetH;

      let sourceW, sourceH, sourceX, sourceY;

      if (imgRatio > targetRatio) {
        // Image is wider than 3x4 - crop sides
        sourceH = img.height;
        sourceW = img.height * targetRatio;
        sourceX = (img.width - sourceW) / 2;
        sourceY = 0;
      } else {
        // Image is taller than 3x4 - crop top/bottom
        sourceW = img.width;
        sourceH = img.width / targetRatio;
        sourceX = 0;
        sourceY = (img.height - sourceH) / 2;
      }

      ctx.drawImage(img, sourceX, sourceY, sourceW, sourceH, 0, 0, targetW, targetH);

      // Compress to JPEG with 0.6 quality for instant opening
      const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
      doc.addImage(dataUrl, 'JPEG', x, y, 30, 40, undefined, 'FAST');
      resolve({ width: 30, height: 40 });
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
};

/**
 * Helper to add header/logo to PDF
 */
export const addHeader = async (doc: any, schoolData: SchoolData) => {
  const profile = schoolData.profile;

  if (schoolData.logo) {
    await addImageProportional(doc, schoolData.logo, 20, 10, 25, 25);
  }

  doc.setFontSize(12);
  doc.setTextColor(0);
  doc.setFont('helvetica', 'bold');
  doc.text(profile.name || 'EduManager School', 50, 18);

  doc.setFontSize(8);
  doc.setTextColor(0);
  doc.setFont('helvetica', 'normal');
  doc.text(`CNPJ: ${profile.cnpj || 'Não informado'}`, 50, 23);
  doc.text(profile.address || '', 50, 27);
  doc.text(`${profile.phone || ''} ${profile.email ? '| ' + profile.email : ''}`, 50, 31);

  doc.setDrawColor(0);
  doc.setLineWidth(0.1);
  doc.line(20, 38, 190, 38);
  return 45;
};

/**
 * Helper to calculate age and get signer info
 */
const getSignerInfo = (student: Student) => {
  if (!student.birthDate) {
    return {
      name: student.guardianName || student.name,
      cpf: student.guardianCpf || student.cpf,
      label: student.guardianName ? 'ASSINATURA DO RESPONSÁVEL' : 'ASSINATURA DO ALUNO'
    };
  }

  const today = new Date();
  const birth = new Date(student.birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--;
  }

  if (age >= 18) {
    return {
      name: student.name,
      cpf: student.cpf,
      label: 'ASSINATURA DO ALUNO'
    };
  } else {
    return {
      name: student.guardianName || 'NÃO INFORMADO',
      cpf: student.guardianCpf || '---',
      label: 'ASSINATURA DO RESPONSÁVEL'
    };
  }
};

/**
 * Helper to get Director info from employees
 */
const getDirectorInfo = (schoolData: SchoolData) => {
  const employees = schoolData.employees || [];
  const categories = schoolData.employeeCategories || [];
  
  const director = employees.find(e => {
    const cat = categories.find(c => c.id === e.categoryId);
    const catName = cat?.name.toLowerCase() || '';
    const empName = e.name.toLowerCase();
    const roleMatch = catName.includes('diretor') || catName.includes('diretoria');
    const nameMatch = empName.includes('diretor') || empName.includes('diretoria');
    return roleMatch || nameMatch;
  });

  if (director) {
    return {
      name: director.name,
      cpf: director.cpf,
      role: 'Diretor'
    };
  }
  
  return null;
};

/**
 * Helper to add page numbers to footer
 */
const addPageNumbers = (doc: any) => {
  const pageCount = doc.internal.getNumberOfPages();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(0);
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.text(
      `Página ${i} de ${pageCount}`,
      doc.internal.pageSize.width / 2,
      doc.internal.pageSize.height - 10,
      { align: 'center' }
    );
  }
};

/**
 * Helper to draw justified text with paragraph support
 */
const drawJustifiedText = async (doc: any, text: string, x: number, y: number, maxWidth: number, lineHeight: number, schoolData: SchoolData) => {
  const paragraphs = text.split('\n').filter(p => p.trim() !== '');
  let currentY = y;
  const margin = x;
  const pageHeight = doc.internal.pageSize.height;

  for (const p of paragraphs) {
    const isClause = p.toUpperCase().startsWith('CLÁUSULA') || p.toUpperCase().startsWith('CLAUSULA');

    // Check for page break before paragraph
    if (currentY > pageHeight - 30) {
      doc.addPage();
      await addHeader(doc, schoolData);
      currentY = 50;
    }

    doc.setFont('helvetica', isClause ? 'bold' : 'normal');
    doc.setFontSize(9);

    // Indent for non-clause paragraphs
    const startX = isClause ? margin : margin + 10;
    const currentMaxWidth = isClause ? maxWidth : maxWidth - 10;

    const lines = doc.splitTextToSize(p, currentMaxWidth);

    for (let i = 0; i < lines.length; i++) {
      // Check for page break before line
      if (currentY > pageHeight - 20) {
        doc.addPage();
        await addHeader(doc, schoolData);
        currentY = 50;
        doc.setFont('helvetica', isClause ? 'bold' : 'normal');
      }

      const line = lines[i];
      const isLastLine = i === lines.length - 1;

      if (isClause || isLastLine || line.trim().length < (currentMaxWidth / 4)) {
        doc.text(line, startX, currentY);
      } else {
        // Justify line
        const words = line.trim().split(/\s+/);
        if (words.length > 1) {
          const totalWordsWidth = words.reduce((sum: number, word: string) => sum + doc.getTextWidth(word), 0);
          const totalSpacing = currentMaxWidth - totalWordsWidth;
          const spacingPerWord = totalSpacing / (words.length - 1);

          let currentX = startX;
          for (let j = 0; j < words.length; j++) {
            doc.text(words[j], currentX, currentY);
            currentX += doc.getTextWidth(words[j]) + spacingPerWord;
          }
        } else {
          doc.text(line, startX, currentY);
        }
      }
      currentY += lineHeight;
    }
    currentY += 4; // Space between paragraphs
  }
  return currentY;
};

/**
 * Helper to draw justified text specifically for the contract
 */
const drawContractText = async (doc: any, text: string, x: number, y: number, maxWidth: number, lineHeight: number, schoolData: SchoolData) => {
  let cleanText = text
    .replace(/PROFISSINALIZANTE/g, 'PROFISSIONALIZANTE')
    .replace(/CONTRADA/g, 'CONTRATADA')
    .replace(/terar/g, 'terá')
    .replace(/apredisagem/g, 'aprendizagem');

  // Preserve the exact organization by splitting strictly by newline
  let paragraphs = cleanText.split('\n');

  let currentY = y;
  const margin = x;
  const pageHeight = doc.internal.pageSize.height;
  const bottomMargin = 20;
  const fontSize = 11; // Uniform font size for the body

  for (const p of paragraphs) {
    if (!p.trim()) {
      currentY += lineHeight * 0.5; // Provide spacing for empty lines
      continue;
    }

    const isClause = /^(CLÁUSULA|CLAUSULA)/i.test(p.trim());

    if (currentY > pageHeight - bottomMargin - 10) {
      doc.addPage();
      currentY = await addHeader(doc, schoolData);
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(fontSize);

    let title = "";
    let restOfText = p.trim();

    if (isClause) {
      const match = restOfText.match(/^(CLÁUSULA\s+\d+.*?[-–—:]\s*|CLAUSULA\s+\d+.*?[-–—:]\s*)/i);
      if (match) {
        title = match[0];
        restOfText = restOfText.substring(title.length).trim();
      } else {
        const match2 = restOfText.match(/^(CLÁUSULA\s+\d+|CLAUSULA\s+\d+)/i);
        if (match2) {
          title = match2[0] + " - ";
          restOfText = restOfText.substring(match2[0].length).trim();
        }
      }
    }

    const startX = margin;
    const currentMaxWidth = maxWidth;

    if (title) {
      if (currentY > pageHeight - bottomMargin - 10) {
        doc.addPage();
        currentY = await addHeader(doc, schoolData);
      }
      doc.setFont('helvetica', 'bold');
      doc.text(title, startX, currentY);
      currentY += lineHeight;
      doc.setFont('helvetica', 'normal');
    }

    if (!restOfText) {
      currentY += lineHeight * 0.5;
      continue;
    }

    const lines = doc.splitTextToSize(restOfText, currentMaxWidth);

    for (let i = 0; i < lines.length; i++) {
      if (currentY > pageHeight - bottomMargin) {
        doc.addPage();
        currentY = await addHeader(doc, schoolData);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(fontSize);
      }

      const line = lines[i];
      const isLastLine = i === lines.length - 1;

      if (isLastLine || line.trim().length < (currentMaxWidth / 2)) {
        doc.text(line, startX, currentY);
      } else {
        // Justify line
        const words = line.trim().split(/\s+/);
        if (words.length > 1) {
          const totalWordsWidth = words.reduce((sum: number, word: string) => sum + doc.getTextWidth(word), 0);
          const totalSpacing = currentMaxWidth - totalWordsWidth;
          const spacingPerWord = totalSpacing / (words.length - 1);

          let currentX = startX;
          for (let j = 0; j < words.length; j++) {
            doc.text(words[j], currentX, currentY);
            currentX += doc.getTextWidth(words[j]) + spacingPerWord;
          }
        } else {
          doc.text(line, startX, currentY);
        }
      }
      currentY += lineHeight;
    }
    currentY += lineHeight * 0.5; // Space between paragraphs
  }
  return currentY;
};

export const pdfService = {
  generateStudentRegistrationPDF: async (student: Student, schoolData: SchoolData) => {
    const doc = new jsPDF() as any;
    const startY = await addHeader(doc, schoolData);
    const cls = schoolData.classes.find(c => c.id === student.classId);
    const course = schoolData.courses.find(c => c.id === cls?.courseId);

    // Title and Date (Centered)
    doc.setFontSize(16);
    doc.setTextColor(0);
    doc.setFont('helvetica', 'bold');
    doc.text('Ficha de Matrícula', 105, startY + 10, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, 105, startY + 16, { align: 'center' });

    // Photo Positioning - Top Right (Standard 3x4cm = 30x40mm)
    const photoX = 155;
    const photoY = startY + 25;
    const photoW = 30;
    const photoH = 40;

    if (student.photo) {
      await addStudentPhoto3x4(doc, student.photo, photoX, photoY);
    }

    // Border around photo area
    doc.setDrawColor(0);
    doc.setLineWidth(0.1);
    doc.rect(photoX, photoY, photoW, photoH);
    if (!student.photo) {
      doc.setFontSize(7);
      doc.setTextColor(150);
      doc.text('FOTO 3X4', photoX + 15, photoY + 20, { align: 'center' });
    }

    let currentY = startY + 30;
    const labelX = 20;

    // 1. Dados do Aluno
    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.setFont('helvetica', 'bold');
    doc.text('Dados do Aluno', labelX, currentY);

    currentY += 8;
    doc.setFontSize(10);

    const drawField = (label: string, value: string, y: number) => {
      doc.setFont('helvetica', 'normal');
      doc.text(`${label}: ${value || '-'}`, labelX, y);
      return y + 6;
    };

    currentY = drawField('Nº Matrícula', student.enrollmentNumber || 'Não gerado', currentY);
    currentY = drawField('Nome', student.name, currentY);
    currentY = drawField('CPF', student.cpf, currentY);
    currentY = drawField('RG', student.rg, currentY);
    currentY = drawField('Data de Nascimento', student.birthDate ? new Date(student.birthDate).toLocaleDateString('pt-BR') : '', currentY);
    currentY = drawField('Email', student.email, currentY);
    currentY = drawField('Telefone', student.phone, currentY);

    currentY += 4;

    // 2. Endereço
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Endereço', labelX, currentY);
    currentY += 6;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`${student.addressStreet || ''}${student.addressNumber ? `, ${student.addressNumber}` : ''} - ${student.addressNeighborhood || ''}`, labelX, currentY);
    currentY += 6;
    doc.text(`${student.addressCity || ''} - ${student.addressState || ''} CEP: ${student.addressZip || ''}`, labelX, currentY);

    currentY += 10;

    // 3. Dados do Curso
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Dados do Curso', labelX, currentY);
    currentY += 8;
    doc.setFontSize(10);
    currentY = drawField('Curso', course?.name || 'Não vinculado', currentY);
    currentY = drawField('Turma', cls?.name || 'Não atribuída', currentY);
    currentY = drawField('Horário', cls?.schedule || 'N/A', currentY);
    currentY = drawField('Professor', cls?.teacher || 'N/A', currentY);
    currentY = drawField('Data Matrícula', new Date(student.registrationDate).toLocaleDateString('pt-BR'), currentY);

    currentY += 10;

    // 4. Termos e Condições
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Termos e Condições', labelX, currentY);

    currentY += 8;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const termsText = "Declaro que as informações acima são verdadeiras e assumo a responsabilidade pelo pagamento das mensalidades escolares conforme contrato de prestação de serviços educacionais.";
    const splitTerms = doc.splitTextToSize(termsText, 170);
    doc.text(splitTerms, labelX, currentY);

    // Footer - Signatures
    const pageHeight = doc.internal.pageSize.height;
    const signer = getSignerInfo(student);

    doc.setDrawColor(0);
    doc.setLineWidth(0.2);

    // Signer Signature
    const sigY = pageHeight - 45;
    doc.line(20, sigY, 90, sigY);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(signer.name.toUpperCase(), 55, sigY + 5, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`CPF: ${signer.cpf || '---'}`, 55, sigY + 9, { align: 'center' });
    doc.text(signer.label, 55, sigY + 13, { align: 'center' });

    // School Signature
    const director = getDirectorInfo(schoolData);
    const dirName = director ? director.name.toUpperCase() : schoolData.profile.name.toUpperCase();
    const dirDoc = director ? `CPF: ${director.cpf}` : `CNPJ: ${schoolData.profile.cnpj || '---'}`;
    const dirRole = director ? director.role : 'Assinatura da Escola';

    doc.line(120, sigY, 190, sigY);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(dirName, 155, sigY + 5, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(dirDoc, 155, sigY + 9, { align: 'center' });
    doc.text(dirRole, 155, sigY + 13, { align: 'center' });

    doc.save(`ficha_matricula_${student.name.replace(/\s+/g, '_').toLowerCase()}.pdf`);
  },

  generateStudentHistoryPDF: async (student: Student, schoolData: SchoolData) => {
    const doc = new jsPDF() as any;
    const startY = await addHeader(doc, schoolData);
    const payments = schoolData.payments.filter(p => p.studentId === student.id);
    const contracts = schoolData.contracts.filter(c => c.studentId === student.id);

    doc.setFontSize(16);
    doc.setTextColor(0);
    doc.text(`Histórico Acadêmico e Financeiro: ${student.name}`, 105, startY + 5, { align: 'center' });

    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text('Contratos Ativos', 20, startY + 20);

    doc.autoTable({
      startY: startY + 25,
      margin: { top: 45 },
      didDrawPage: async (data: any) => {
        if (data.pageNumber > 1) await addHeader(doc, schoolData);
      },
      head: [['Título', 'Data Emissão']],
      body: contracts.map(c => [
        c.title,
        new Date(c.createdAt).toLocaleDateString('pt-BR')
      ]),
      headStyles: { fillColor: [0, 0, 0] }
    });

    const nextY = (doc as any).lastAutoTable.finalY + 15;
    doc.setFontSize(12);
    doc.text('Histórico de Pagamentos', 20, nextY);

    doc.autoTable({
      startY: nextY + 5,
      margin: { top: 45 },
      didDrawPage: async (data: any) => {
        if (data.pageNumber > 1) await addHeader(doc, schoolData);
      },
      head: [['Descrição', 'Vencimento', 'Valor', 'Status']],
      body: payments.map(p => [
        p.description || (p.type === 'registration' ? 'Matrícula' : 'Mensalidade'),
        new Date(p.dueDate).toLocaleDateString('pt-BR'),
        `R$ ${p.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
        p.status === 'paid' ? 'Pago' : p.status === 'overdue' ? 'Atrasado' : 'Pendente'
      ]),
      headStyles: { fillColor: [0, 0, 0] }
    });

    doc.save(`historico_${student.name.replace(/\s+/g, '_').toLowerCase()}.pdf`);
  },

  generatePaymentReceiptPDF: async (payment: Payment, student: Student, schoolData: SchoolData) => {
    const doc = new jsPDF() as any;

    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    doc.rect(10, 10, 190, 140); // Border

    const profile = schoolData.profile;
    if (schoolData.logo) {
      await addImageProportional(doc, schoolData.logo, 20, 15, 20, 20);
    }
    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text(profile.name, 45, 18);
    doc.setFontSize(8);
    doc.text(`CNPJ: ${profile.cnpj || '---'}`, 45, 22);
    doc.text(profile.address || '', 45, 26);

    doc.setFontSize(16);
    doc.setTextColor(0);
    doc.text('RECIBO DE PAGAMENTO', 105, 45, { align: 'center' });

    doc.setFontSize(9);
    doc.setTextColor(0);
    doc.text(`Nº do Documento: ${payment.id.substring(0, 8).toUpperCase()}`, 150, 55);

    doc.setFontSize(11);
    doc.setTextColor(0);
    doc.text(`Recebemos de: ${student.name}`, 20, 70);
    doc.text(`CPF: ${student.cpf || '---'}`, 20, 76);
    doc.text(`A quantia de: R$ ${payment.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 20, 85);

    const typeLabel = payment.type === 'registration' ? 'Taxa de Matrícula' :
      payment.type === 'monthly' ? 'Mensalidade do Curso' : 'Outros Serviços';

    doc.text(`Referente a: ${typeLabel} ${payment.description ? `(${payment.description})` : ''}`, 20, 95);
    doc.text(`Data de Vencimento: ${new Date(payment.dueDate).toLocaleDateString('pt-BR')}`, 20, 105);

    if (payment.status === 'paid' && payment.paidDate) {
      doc.setFontSize(12);
      doc.setTextColor(0);
      doc.text(`PAGO EM: ${payment.paidDate}`, 105, 120, { align: 'center' });
    }

    doc.setTextColor(0);
    doc.setFontSize(9);
    doc.text('_________________________________', 105, 140, { align: 'center' });
    doc.text('Assinatura / Carimbo', 105, 145, { align: 'center' });

    doc.save(`recibo_${student.name.replace(/\s+/g, '_').toLowerCase()}_${payment.id.substring(0, 4)}.pdf`);
  },

  generateContractPDF: async (contract: Contract, student: Student, schoolData: SchoolData) => {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    }) as any;

    let currentY = await addHeader(doc, schoolData);

    // Title
    doc.setFontSize(14);
    doc.setTextColor(0);
    doc.setFont('helvetica', 'bold');
    doc.text('CONTRATO DE PRESTAÇÃO DE SERVIÇOS EDUCACIONAIS', 105, currentY, { align: 'center' });

    currentY += 10;

    // Contract Header Info
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');

    doc.text(`DATA DE EMISSÃO: ${new Date(contract.createdAt).toLocaleDateString('pt-BR')}`, 20, currentY);
    currentY += 6;
    doc.text(`CONTRATANTE: ${student.name.toUpperCase()}`, 20, currentY);
    currentY += 6;
    doc.text(`CPF: ${student.cpf || '---'}`, 20, currentY);

    currentY += 10;

    // Draw Justified Content with Pagination
    const margin = 20; // 2cm
    const pageWidth = doc.internal.pageSize.width;
    const maxWidth = pageWidth - (margin * 2);
    const lineHeight = 5.5; // 1.5 spacing approx for 10pt font

    currentY = await drawContractText(doc, contract.content, margin, currentY, maxWidth, lineHeight, schoolData);

    // Signatures
    const pageHeight = doc.internal.pageSize.height;
    const signer = getSignerInfo(student);

    // Check if signatures fit on current page (need about 45mm to keep them together without breaking)
    if (currentY > pageHeight - 45) {
      doc.addPage();
      currentY = await addHeader(doc, schoolData);
      currentY += 10;
    } else {
      currentY += 25; // Extra space before signatures
    }

    // Signature Block - Unbreakable, Side by Side
    doc.setDrawColor(0);
    doc.setLineWidth(0.2);

    const sigY = currentY;

    // Signer Signature (Left Column)
    doc.line(20, sigY, 90, sigY);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(signer.name.toUpperCase(), 55, sigY + 5, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`CPF: ${signer.cpf || '---'}`, 55, sigY + 9, { align: 'center' });
    doc.text(signer.label, 55, sigY + 13, { align: 'center' });

    // School Signature (Right Column)
    const director = getDirectorInfo(schoolData);
    const dirName = director ? director.name.toUpperCase() : schoolData.profile.name.toUpperCase();
    const dirDoc = director ? `CPF: ${director.cpf}` : `CNPJ: ${schoolData.profile.cnpj || '---'}`;
    const dirRole = director ? director.role : 'Assinatura da Escola';

    doc.line(120, sigY, 190, sigY);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(dirName, 155, sigY + 5, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(dirDoc, 155, sigY + 9, { align: 'center' });
    doc.text(dirRole, 155, sigY + 13, { align: 'center' });

    // Add Page Numbers to all pages
    addPageNumbers(doc);

    doc.save(`contrato_${contract.title.replace(/\s+/g, '_').toLowerCase()}.pdf`);
  },

  generateClassListPDF: async (cls: Class, schoolData: SchoolData) => {
    const doc = new jsPDF() as any;
    const startY = await addHeader(doc, schoolData);
    const course = schoolData.courses.find(c => c.id === cls.courseId);
    const students = schoolData.students.filter(s => s.classId === cls.id);

    doc.setFontSize(16);
    doc.setTextColor(0);
    doc.text(`Relatório de Turma: ${cls.name}`, 105, startY + 5, { align: 'center' });

    doc.setFontSize(10);
    doc.setTextColor(0);
    doc.text(`Curso: ${course?.name || 'N/A'}`, 20, startY + 15);
    doc.text(`Professor: ${cls.teacher}`, 20, startY + 22);
    doc.text(`Horário: ${cls.schedule}`, 20, startY + 29);

    doc.autoTable({
      startY: startY + 35,
      margin: { top: 45 },
      didDrawPage: async (data: any) => {
        if (data.pageNumber > 1) await addHeader(doc, schoolData);
      },
      head: [['Nº', 'Nome do Aluno', 'Telefone', 'Status']],
      body: students.map((s, idx) => [
        idx + 1,
        s.name,
        s.phone,
        s.status === 'active' ? 'Ativo' : 'Inativo'
      ]),
      headStyles: { fillColor: [0, 0, 0] }
    });

    doc.save(`turma_${cls.name.replace(/\s+/g, '_').toLowerCase()}.pdf`);
  },

  generateStudentListPDF: async (schoolData: SchoolData) => {
    const doc = new jsPDF() as any;
    const startY = await addHeader(doc, schoolData);

    doc.setFontSize(16);
    doc.setTextColor(0);
    doc.text('Relatório Geral de Alunos', 105, startY + 5, { align: 'center' });

    doc.autoTable({
      startY: startY + 15,
      margin: { top: 45 },
      didDrawPage: async (data: any) => {
        if (data.pageNumber > 1) await addHeader(doc, schoolData);
      },
      head: [['Nome', 'CPF', 'Email', 'Turma', 'Status']],
      body: schoolData.students.map(s => {
        const cls = schoolData.classes.find(c => c.id === s.classId);
        return [
          s.name,
          s.cpf || '-',
          s.email,
          cls?.name || '-',
          s.status === 'active' ? 'Ativo' : 'Inativo'
        ];
      }),
      headStyles: { fillColor: [0, 0, 0] }
    });

    doc.save(`lista_alunos_${new Date().toISOString().split('T')[0]}.pdf`);
  },

  generateFullSchoolReportPDF: async (schoolData: SchoolData) => {
    const doc = new jsPDF() as any;
    const startY = await addHeader(doc, schoolData);

    doc.setFontSize(18);
    doc.setTextColor(0);
    doc.text('Relatório Consolidado', 105, startY + 5, { align: 'center' });

    doc.setFontSize(12);
    doc.text('Visão Geral', 20, startY + 20);
    doc.setFontSize(10);
    doc.text(`Total Alunos: ${schoolData.students.length}`, 20, startY + 28);
    doc.text(`Alunos Ativos: ${schoolData.students.filter(s => s.status === 'active').length}`, 20, startY + 34);
    doc.text(`Turmas Ativas: ${schoolData.classes.length}`, 20, startY + 40);

    doc.autoTable({
      startY: startY + 50,
      margin: { top: 45 },
      didDrawPage: async (data: any) => {
        if (data.pageNumber > 1) await addHeader(doc, schoolData);
      },
      head: [['Alunos', 'Turmas', 'Financeiro Pago', 'Pendente']],
      body: [[
        schoolData.students.length,
        schoolData.classes.length,
        `R$ ${schoolData.payments.filter(p => p.status === 'paid').reduce((sum, p) => sum + p.amount, 0).toFixed(2)}`,
        `R$ ${schoolData.payments.filter(p => p.status !== 'paid').reduce((sum, p) => sum + p.amount, 0).toFixed(2)}`
      ]],
      headStyles: { fillColor: [0, 0, 0] }
    });

    doc.save(`relatorio_geral_${new Date().toISOString().split('T')[0]}.pdf`);
  },

  generateCancellationTermPDF: async (student: Student, schoolData: SchoolData, cancellationReason: string) => {
    const doc = new jsPDF() as any;
    const startY = await addHeader(doc, schoolData);
    const cls = schoolData.classes.find(c => c.id === student.classId);
    const course = schoolData.courses.find(c => c.id === cls?.courseId);

    // Title
    doc.setFontSize(16);
    doc.setTextColor(0);
    doc.setFont('helvetica', 'bold');
    doc.text('TERMO DE CANCELAMENTO DE MATRÍCULA', 105, startY + 10, { align: 'center' });

    let currentY = startY + 25;

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Escola:', 20, currentY);
    doc.setFont('helvetica', 'normal');
    doc.text(schoolData.profile.name || 'Microtec Informática Cursos', 38, currentY);

    currentY += 15;

    // Student Data
    doc.setFont('helvetica', 'bold');
    doc.text('Dados do Aluno:', 20, currentY);
    currentY += 8;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(`Nome: ${student.name} | CPF: ${student.cpf || 'Não informado'}`, 20, currentY);
    currentY += 6;
    doc.text(`Curso: ${course?.name || 'Não informado'} | Turma: ${cls?.name || 'Não informado'}`, 20, currentY);

    currentY += 12;

    // Guardian Data
    if (student.guardianName) {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Dados do Responsável (se menor de idade):', 20, currentY);
      currentY += 8;

      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.text(`Nome: ${student.guardianName} | CPF: ${student.guardianCpf || 'Não informado'}`, 20, currentY);
      currentY += 12;
    }

    // Reason
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Motivo do Cancelamento:', 20, currentY);
    currentY += 8;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    const splitReason = doc.splitTextToSize(cancellationReason, 170);
    doc.text(splitReason, 20, currentY);
    currentY += (splitReason.length * 6) + 10;

    // Term Text
    const termText1 = 'Pelo presente termo, o(a) aluno(a) ou seu responsável legal acima qualificado, solicita formalmente o CANCELAMENTO DA MATRÍCULA no curso especificado.';
    const termText2 = 'Declara estar ciente de que o cancelamento encerra o vínculo educacional a partir desta data, não isentando o contratante de eventuais pendências financeiras adquiridas e vencidas até o presente momento, conforme contrato de prestação de serviços educacionais assinado no ato da matrícula.';

    const splitTerm1 = doc.splitTextToSize(termText1, 170);
    doc.text(splitTerm1, 20, currentY);
    currentY += (splitTerm1.length * 6) + 4;

    const splitTerm2 = doc.splitTextToSize(termText2, 170);
    doc.text(splitTerm2, 20, currentY);
    currentY += (splitTerm2.length * 6) + 20;

    // Date and Signatures
    const dateStr = new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
    doc.text(`Redenção - CE, ${dateStr}.`, 20, currentY);

    currentY += 30;

    doc.line(20, currentY, 90, currentY);
    doc.line(120, currentY, 190, currentY);

    currentY += 5;
    doc.setFontSize(10);
    doc.text('Assinatura do Aluno ou Responsável Legal', 55, currentY, { align: 'center' });
    doc.text(`${schoolData.profile.name || 'Microtec Informática Cursos'} (Administração)`, 155, currentY, { align: 'center' });

    doc.save(`termo_cancelamento_${student.name.replace(/\s+/g, '_')}.pdf`);
  }
};