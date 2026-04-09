import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import multer from 'multer';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// === ASAAS: URL base dinâmica (Sandbox ou Produção) ===
// Para migrar para produção, basta alterar ASAAS_API_URL no Portainer
// Sandbox: https://sandbox.asaas.com/api
// Produção: https://api.asaas.com
const ASAAS_BASE_URL = process.env.ASAAS_API_URL || 'https://sandbox.asaas.com/api';

app.use(express.json());
app.use(cors());

// Supabase Setup
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_KEY;
  let supabase = null;
  
  if (supabaseUrl && supabaseKey) {
    try {
      supabase = createClient(supabaseUrl, supabaseKey);
    } catch (e) {
      console.warn('Failed to initialize Supabase client:', e);
    }
  } else {
    console.warn('Supabase credentials not found. Some API routes may fail.');
  }

const cancelCache = new Set();
const sentCache = new Set(); // Cache para evitar disparos duplicados (Anti-Spam/Race Condition)
const lockCache = new Set(); // Cache de trava para processamento em curso

const upload = multer({ storage: multer.memoryStorage() });

// Rota para upload e compressão da logo
app.post('/api/upload/logo', upload.single('logo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    }

    // Comprimir e converter para WebP
    const compressedBuffer = await sharp(req.file.buffer)
      .resize(500, 500, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 60 })
      .toBuffer();

    const fileName = `logo_${Date.now()}.webp`;
    const filePath = `logos/${fileName}`;

    // Upload para o Supabase Storage
    const { data, error } = await supabase.storage
      .from('edumanager-assets')
      .upload(filePath, compressedBuffer, {
        contentType: 'image/webp',
        upsert: true
      });

    if (error) {
      console.error('Erro no upload para o Supabase:', error);
      return res.status(500).json({ error: 'Erro ao salvar a imagem no storage.' });
    }

    // Obter URL pública
    const { data: publicUrlData } = supabase.storage
      .from('edumanager-assets')
      .getPublicUrl(filePath);

    return res.status(200).json({ url: publicUrlData.publicUrl });
  } catch (error) {
    console.error('Erro ao processar logo:', error);
    return res.status(500).json({ error: 'Erro interno ao processar a imagem.' });
  }
});

// Função formatadora de data
function formatCobrancaDate(dateStr) {
  if (!dateStr) return '';
  const [Ano, Mes, Dia] = dateStr.split('-');
  if (!Dia) return dateStr;
  return `${Dia}/${Mes}/${Ano}`;
}

// Integarção WhatsApp Evolution API
async function sendEvolutionMessage(asaasPaymentId, eventType, paymentPayload = null) {
  try {
    // 1. Buscar dados da cobrança no banco com pequena retentativa para evitar lag de insert
    let cob = null;
    for (let i = 0; i < 3; i++) {
      const { data } = await supabase.from('alunos_cobrancas').select('*').eq('asaas_payment_id', asaasPaymentId).single();
      if (data) {
        cob = data;
        break;
      }
      if (i < 2) await new Promise(r => setTimeout(r, 1000));
    }

    if (!cob) return console.log(`[Evolution] Cobrança não encontrada no banco após tentativas: ${asaasPaymentId}`);
    
    let fallbackValor = cob.valor;
    let fallbackVencimento = cob.vencimento;
    let fallbackDescricao = paymentPayload?.description || 'serviços educacionais';

    const { data: schoolDataObj } = await supabase.from('school_data').select('data').eq('id', 1).single();
    if (!schoolDataObj || !schoolDataObj.data) {
      console.log('[WhatsApp] Configurações school_data não encontradas');
      return;
    }

    const appData = schoolDataObj.data;
    const evoConfig = appData.evolutionConfig;
    const templates = appData.messageTemplates;
    
    if (!evoConfig || !evoConfig.apiUrl || !evoConfig.apiKey || !evoConfig.instanceName) {
      console.log('[WhatsApp] Credenciais Evolution não configuradas.');
      return;
    }

    // Anti-Spam: Evita enviar a mesma mensagem para o mesmo ID e evento em curto intervalo
    const normalizedEvent = (eventType === 'PAYMENT_RECEIVED' || eventType === 'PAYMENT_CONFIRMED') ? 'PAYMENT_RECEIVED' : eventType;
    const cacheKey = `${asaasPaymentId}_${normalizedEvent}`;
    
    if (sentCache.has(cacheKey)) {
      console.log(`[WhatsApp] Mensagem para ${cacheKey} já enviada recentemente. Ignorando.`);
      return;
    }
    sentCache.add(cacheKey);
    setTimeout(() => sentCache.delete(cacheKey), 30000); // Limpa após 30s

    console.log('[WhatsApp] Configurações encontradas para evento:', eventType);

    const aluno = appData.students?.find(s => s.id === cob.aluno_id);
    if (!aluno) return console.log(`[WhatsApp] Aluno não encontrado localmente para a cobrança.`);
    
    const birthDateStr = aluno.data_nascimento || aluno.birthDate || '';
    let age = 18;

    if (birthDateStr && birthDateStr.includes('-')) {
      const parts = birthDateStr.split('T')[0].split('-'); 
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const day = parseInt(parts[2], 10);
      
      const birthDate = new Date(year, month - 1, day);
      const today = new Date();
      age = today.getFullYear() - birthDate.getFullYear();
      const m = today.getMonth() - birthDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
    }
    
    const isMinor = age < 18;
    const targetPhone = (isMinor && (aluno.telefone_responsavel || aluno.guardianPhone)) ? (aluno.telefone_responsavel || aluno.guardianPhone) : (aluno.telefone || aluno.phone);
    const targetName = (isMinor && (aluno.nome_responsavel || aluno.guardianName)) ? (aluno.nome_responsavel || aluno.guardianName) : (aluno.nome || aluno.name);

    if (!targetPhone) return console.log('[WhatsApp] Sem telefone para envio.');

    // Remove tudo que não é número e adiciona 55 se vier sem DDI
    let cleanPhone = targetPhone.replace(/\D/g, '');
    if (cleanPhone.length === 10 || cleanPhone.length === 11) cleanPhone = '55' + cleanPhone;

    console.log('[WhatsApp] Destinatário definido:', targetName, cleanPhone);

    // Buscar no Asaas os detalhes recentes (description e URL do PDF)
    let descricao = fallbackDescricao;
    let pdfUrl = cob ? (cob.link_carne || cob.link_boleto || '') : '';
    let isCarneCompleto = false;

    const pResp = await fetch(`${ASAAS_BASE_URL}/v3/payments/${asaasPaymentId}`, { 
      headers: { 'access_token': process.env.ASAAS_API_KEY } 
    });
    
    if (pResp.ok) {
      const pData = await pResp.json();
      if (pData.description) {
        descricao = pData.description;
      }
      
      // Fallback para valor e vencimento se vieram do Asaas
      if (pData.value) fallbackValor = pData.value;
      if (pData.dueDate) fallbackVencimento = pData.dueDate;

      if (descricao.includes('Parcela')) {
        if (eventType === 'PAYMENT_CREATED') {
          descricao = descricao.replace(' de ', ' a ');
        } else if (['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED', 'PAYMENT_UPDATED'].includes(eventType)) {
          // Garante 'de' em vez de 'a'
          descricao = descricao.replace(/Parcela (\d+) a (\d+)/g, 'Parcela $1 de $2');
        }
      }

      // 1. Identificar se é Carnê e evitar Spam
      if (pData.installment && eventType === 'PAYMENT_CREATED') {
        if (pData.installmentNumber > 1) {
          console.log(`[WhatsApp] Ignorando envio da parcela ${pData.installmentNumber} para não spammar o aluno com o carnê repetido.`);
          return;
        }
        
        // É a primeira parcela do carnê
        isCarneCompleto = true;
        // 2. Apontar pdfUrl para a rota de carnês completo do Asaas
        pdfUrl = `${ASAAS_BASE_URL}/v3/installments/${pData.installment}/paymentBook`;
      } else {
        // 3. Manter o fluxo para cobranças avulsas
        pdfUrl = pData.transactionReceiptUrl || pData.bankSlipUrl || pData.invoiceUrl || pdfUrl;
      }
    }

    // Fallbacks solicitados
    const fbGerado = 'Olá {nome}, sua cobrança referente a {descricao} no valor de R$ {valor} foi gerada. Vencimento: {vencimento}.';
    const fbPago = 'Olá {nome}, confirmamos o pagamento de R$ {valor} referente a {descricao}. Muito obrigado!';
    const fbAtrasado = 'Olá {nome}, o boleto referente a {descricao} de R$ {valor} venceu em {vencimento}. Segue o PDF da 2ª via atualizada abaixo:';
    const fbCancelado = 'Olá {nome}, a cobrança referente a {descricao} foi cancelada.';
    const fbAtualizado = 'Olá {nome}, o boleto de {descricao} foi atualizado. Segue a nova versão:';

    let templateText = '';
    if (eventType === 'PAYMENT_CREATED') templateText = templates?.boletoGerado || fbGerado;
    else if (eventType === 'PAYMENT_RECEIVED' || eventType === 'PAYMENT_CONFIRMED') templateText = templates?.pagamentoConfirmado || fbPago;
    else if (eventType === 'PAYMENT_OVERDUE') templateText = templates?.boletoVencido || fbAtrasado;
    else if (eventType === 'PAYMENT_DELETED') templateText = templates?.cobrancaCancelada || fbCancelado;
    else if (eventType === 'PAYMENT_UPDATED') templateText = templates?.cobrancaAtualizada || fbAtualizado;
    
    if (!templateText) return;

    let msgFinal = templateText
      .replace(/{nome}/g, targetName)
      .replace(/{nome_aluno}/g, aluno.name)
      .replace(/{valor}/g, parseFloat(fallbackValor).toFixed(2).replace('.', ','))
      .replace(/{vencimento}/g, formatCobrancaDate(fallbackVencimento))
      .replace(/{link_boleto}/g, pdfUrl)
      .replace(/{descricao}/g, descricao);

    const isTextOnlyEvent = ['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED', 'PAYMENT_DELETED'].includes(eventType);
    const isPaymentConfirmation = ['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED'].includes(eventType);
    const isCreationEvent = eventType === 'PAYMENT_CREATED';
    
    // Se for confirmação de pagamento, adicionamos o link do recibo (HTML) ao texto apenas se ele não estiver no template
    if (isPaymentConfirmation && pdfUrl && !templateText.includes('{link_boleto}')) {
      msgFinal += `\n\n📄 Acesse seu comprovante aqui:\n${pdfUrl}`;
    }

    // Download do PDF e Conversão para Base64 com Retentativa (Asaas pode demorar a gerar o Carnê)
    let base64Pdf = null;
    if (pdfUrl && !isTextOnlyEvent) {
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          console.log(`[WhatsApp] Tentando baixar PDF (Tentativa ${attempt}): ${pdfUrl}`);
          
          const fetchOptions = {
            headers: { 'Accept': 'application/pdf' }
          };
          if (pdfUrl.includes('asaas.com/api')) {
            fetchOptions.headers['access_token'] = process.env.ASAAS_API_KEY;
          }

          const pdfResp = await fetch(pdfUrl, fetchOptions);
          
          if (pdfResp.ok && pdfResp.headers.get('content-type')?.includes('pdf')) {
            const arrayBuffer = await pdfResp.arrayBuffer();
            base64Pdf = Buffer.from(arrayBuffer).toString('base64');
            console.log(`[WhatsApp] PDF baixado e convertido para Base64 com sucesso.`);
            break;
          } else {
            console.warn(`[WhatsApp] Tentativa ${attempt} falhou (Status: ${pdfResp.status}).`);
            if (attempt < 3) await new Promise(r => setTimeout(r, 3000));
          }
        } catch (err) {
          console.warn(`[WhatsApp] Exceção na tentativa ${attempt}: ${err.message}`);
          if (attempt < 3) await new Promise(r => setTimeout(r, 3000));
        }
      }
    }

    // Se falhou o download do PDF mas temos a URL, injeta no texto para o aluno não ficar sem nada
    if ((isCreationEvent || isPaymentConfirmation || eventType === 'PAYMENT_UPDATED') && !base64Pdf && pdfUrl) {
      msgFinal += `\n\n📄 Acesse aqui sua cobrança:\n${pdfUrl}`;
    }

    // Define endpoint e payload
    let endpoint = 'sendText';
    let payload = {};

    if (base64Pdf) {
      endpoint = 'sendMedia';
      let fileName = `Boleto-${targetName.replace(/\s+/g, '')}.pdf`;
      if (isCarneCompleto) fileName = `Carne-${targetName.replace(/\s+/g, '')}.pdf`;
      if (isPaymentConfirmation) fileName = `Comprovante-${targetName.replace(/\s+/g, '')}.pdf`;

      payload = {
        number: cleanPhone,
        options: { delay: 1200, presence: "composing" },
        mediatype: "document",
        mimetype: "application/pdf",
        fileName: fileName,
        media: base64Pdf,
        caption: msgFinal
      };
    } else {
      payload = {
        number: cleanPhone,
        text: msgFinal
      };
    }

    const url = `${evoConfig.apiUrl.replace(/\/$/, '')}/message/${endpoint}/${evoConfig.instanceName}`;
    
    console.log(`[Evolution] POST para ${cleanPhone} (${eventType}) usando ${endpoint}`);
    
    const sendResp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': evoConfig.apiKey },
      body: JSON.stringify(payload)
    });

    if (sendResp.ok) {
      console.log(`[WhatsApp] ✅ Disparo enviado com sucesso! A Evolution API recebeu a mensagem para o número:`, cleanPhone);
    } else {
      const respError = await sendResp.text();
      console.error(`[WhatsApp] ❌ Erro no disparo Evolution API:`, sendResp.status, respError);
    }

  } catch (error) {
    console.error('[WhatsApp] Erro interno:', error.message);
  }
}


// Webhook Asaas
app.post('/api/webhook_asaas', async (req, res) => {
  const tokenRecebido = req.headers['asaas-access-token'];
  if (tokenRecebido !== process.env.ASAAS_WEBHOOK_TOKEN) {
    console.error('Tentativa de acesso negada: Token do webhook inválido!');
    addLog('Webhook', 'Auth Negada', 'Token inválido recebido');
    return res.status(401).json({ error: 'Não autorizado' });
  }

  try {
    const payload = req.body;
    
    // 1. Bloqueio de Spam (Retentativas Antigas do Asaas)
    if (payload.dateCreated) {
      const eventDate = new Date(payload.dateCreated);
      const now = new Date();
      const diffHours = (now.getTime() - eventDate.getTime()) / (1000 * 60 * 60);
      if (diffHours > 24) {
        console.log('Webhook antigo ignorado');
        return res.status(200).send('OK');
      }
    }

    const asaasPaymentId = payload.payment.id;
    let updateData = {};

    switch (payload.event) {
      case 'PAYMENT_CREATED':
        // No webhook de criação, apenas disparamos se ainda não foi disparado pela rota manual
        setTimeout(() => sendEvolutionMessage(asaasPaymentId, 'PAYMENT_CREATED'), 2000); 
        return res.status(200).json({ message: 'Webhook PAYMENT_CREATED processado' });
      case 'PAYMENT_RECEIVED':
      case 'PAYMENT_CONFIRMED':
        updateData = { 
          status: 'PAGO', 
          valor: payload.payment.value,
          data_pagamento: payload.payment.confirmedDate || payload.payment.paymentDate || new Date().toISOString().split('T')[0]
        };
        
        // Pega o link do recibo diretamente do payload do Asaas (evita uma requisição extra)
        if (payload.payment.transactionReceiptUrl) {
          updateData.transaction_receipt_url = payload.payment.transactionReceiptUrl;
        }

        sendEvolutionMessage(asaasPaymentId, 'PAYMENT_RECEIVED');
        break;
      case 'PAYMENT_OVERDUE':
      case 'PAYMENT_UPDATED':
      case 'PAYMENT_RESTORED':
        const statusMap = {
          'PENDING': 'PENDENTE',
          'OVERDUE': 'ATRASADO',
          'RECEIVED': 'PAGO',
          'CONFIRMED': 'PAGO',
          'RECEIVED_IN_CASH': 'PAGO',
          'REFUNDED': 'CANCELADO',
          'DELETED': 'CANCELADO'
        };
        
        updateData = { 
          valor: payload.payment.value, 
          vencimento: payload.payment.dueDate,
          status: statusMap[payload.payment.status] || undefined
        };
        
        // Remove campos undefined para evitar sobrescrever dados válidos
        Object.keys(updateData).forEach(k => updateData[k] === undefined && delete updateData[k]);
        
        if (payload.event === 'PAYMENT_OVERDUE') {
          sendEvolutionMessage(asaasPaymentId, 'PAYMENT_OVERDUE');
        } else if (payload.event === 'PAYMENT_UPDATED') {
          sendEvolutionMessage(asaasPaymentId, 'PAYMENT_UPDATED');
        }
        break;
      case 'PAYMENT_DELETED':
      case 'PAYMENT_CANCELED':
        // 1. Escudo Anti-Spam no Cancelamento (Webhook)
        const paymentDataPayload = payload.payment;
        const installmentId = paymentDataPayload.installment;

        if (installmentId) {
          if (cancelCache.has(installmentId)) {
            console.log(`[WhatsApp Webhook] Ignorando spam de cancelamento para a parcela do carnê ${installmentId}`);
            await supabase.from('alunos_cobrancas').delete().eq('asaas_payment_id', asaasPaymentId);
            return res.status(200).send('OK');
          }
          cancelCache.add(installmentId);
          setTimeout(() => cancelCache.delete(installmentId), 60000);
        }

        // 2. Disparo via função padrão padronizada
        await sendEvolutionMessage(asaasPaymentId, 'PAYMENT_DELETED');
        
        // 3. Exclusão SOMENTE DEPOIS do envio
        await supabase.from('alunos_cobrancas').delete().eq('asaas_payment_id', asaasPaymentId);
        addLog('Webhook', `Sucesso PAYMENT_DELETED`, { asaasPaymentId });
        return res.status(200).send('OK');
      // PAYMENT_UPDATED movido para o bloco unificado acima
      default:
        console.log(`Evento ignorado: ${payload.event}`);
        return res.status(200).json({ message: 'Evento ignorado' });
    }

    const { error } = await supabase
      .from('alunos_cobrancas')
      .update(updateData)
      .eq('asaas_payment_id', asaasPaymentId);

    if (error) {
      console.error(`Erro ao atualizar Supabase para o evento ${payload.event}:`, error);
      addLog('Webhook', `Erro ${payload.event}`, { asaasPaymentId, error: error.message });
      throw error;
    }
    
    addLog('Webhook', `Sucesso ${payload.event}`, { asaasPaymentId, updateData });
    console.log(`Sucesso: Pagamento ${asaasPaymentId} atualizado via Webhook (${payload.event})!`);
    return res.status(200).json({ message: 'Webhook processado com sucesso' });

  } catch (error) {
      console.error('Erro no Webhook:', error);
      addLog('Webhook', 'Erro Interno', error.message);
      return res.status(500).json({ error: 'Erro interno' });
    }
  });
  
  // Webhook: Evolution API Status
  app.post('/api/webhooks/evolution', (req, res) => {
    try {
      const payload = req.body;
      
      // Evolution usually pushes array in data for some events, or object
      let messageData = payload.data || payload;
      
      // Identificar o status 'READ'
      const status = messageData.status;
      
      if (status === 'READ') {
        const phone = messageData.key?.remoteJid || messageData.remoteJid || 'Desconhecido';
        const cleanPhone = phone.split('@')[0];
        console.log(`👀 [WhatsApp STATUS] A mensagem referente à cobrança enviada para o número ${cleanPhone} foi LIDA pelo aluno/responsável!`);
      }
  
      res.status(200).send('OK');
    } catch (err) {
      console.error('[Evolution Webhook] Erro ao processar payload:', err);
      res.status(500).send('Erro interno');
    }
  });

// Gerar Cobrança
app.post('/api/gerar_cobranca', async (req, res) => {
  try {
    const { 
      aluno_id, nome, cpf, email, valor, vencimento, multa, juros, desconto,
      telefone, cep, endereco, numero, bairro, descricao, parcelas
    } = req.body;

    // 1. Search or Create Asaas Customer
    let customerId = '';
    
    // Try to find customer by CPF first
    const searchRes = await fetch(`${ASAAS_BASE_URL}/v3/customers?cpfCnpj=${cpf}`, {
      method: 'GET',
      headers: {
        'access_token': process.env.ASAAS_API_KEY
      }
    });

    if (searchRes.ok) {
      const searchData = await searchRes.json();
      if (searchData.data && searchData.data.length > 0) {
        customerId = searchData.data[0].id;
      }
    }

    if (!customerId) {
      const customerRes = await fetch(`${ASAAS_BASE_URL}/v3/customers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'access_token': process.env.ASAAS_API_KEY
        },
        body: JSON.stringify({
          name: nome,
          cpfCnpj: cpf,
          email: email,
          mobilePhone: telefone,
          postalCode: cep,
          address: endereco,
          addressNumber: numero,
          province: bairro
        })
      });

      if (!customerRes.ok) {
        const errorData = await customerRes.json();
        console.error('Asaas Customer Error:', errorData);
        // Extract specific error message from Asaas if available
        const asaasMsg = errorData.errors?.[0]?.description || 'Falha ao criar cliente no Asaas';
        throw new Error(asaasMsg);
      }

      const customerData = await customerRes.json();
      customerId = customerData.id;
    }

    // 2. Create Asaas Payment
    const asaasPayload = {
      customer: customerId,
      billingType: 'BOLETO',
      dueDate: vencimento,
      description: descricao ? `${descricao} - Microtec Informática Cursos` : 'Mensalidade - Microtec Informática Cursos'
    };

    const isInstallment = parcelas && parseInt(parcelas) > 1;

    if (isInstallment) {
      // Condição B: Parcelamento / Carnê (> 1 Parcela)
      asaasPayload.installmentCount = parseInt(parcelas);
      asaasPayload.installmentValue = parseFloat(valor);
    } else {
      // Condição A: Cobrança Avulsa (1 Parcela)
      asaasPayload.value = parseFloat(valor);
    }

    const fineValue = parseFloat(multa);
    const interestValue = parseFloat(juros);
    const discountValue = parseFloat(desconto);

    if (!isNaN(fineValue) && fineValue > 0) asaasPayload.fine = { value: fineValue, type: 'PERCENTAGE' };
    if (!isNaN(interestValue) && interestValue > 0) asaasPayload.interest = { value: interestValue, type: 'PERCENTAGE' };
    if (!isNaN(discountValue) && discountValue > 0) asaasPayload.discount = { value: discountValue, dueDateLimitDays: 0, type: 'FIXED' };

    console.log('Payload enviado para o Asaas:', asaasPayload);

    const paymentRes = await fetch(`${ASAAS_BASE_URL}/v3/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'access_token': process.env.ASAAS_API_KEY
      },
      body: JSON.stringify(asaasPayload)
    });

    if (!paymentRes.ok) {
      const errorData = await paymentRes.json();
      console.error('Asaas Payment Error:', errorData);
      const asaasMsg = errorData.errors?.[0]?.description || 'Falha ao criar cobrança no Asaas';
      throw new Error(asaasMsg);
    }

    const paymentData = await paymentRes.json();
    console.log('Resposta do Asaas (Criação):', paymentData);

    // 3. Save to Supabase
    let paymentsToSave = [];
    
    // CORREÇÃO: O ID oficial do parcelamento SEMPRE vem em paymentData.installment
    const installmentId = formatInstallmentId(paymentData.installment);

    if (isInstallment && installmentId) {
      // Condição B: Salvar todas as parcelas geradas com o ID do pacote (installment)
      console.log('Detectado Parcelamento. ID do Carnê:', installmentId);
      
      // Buscar todas as cobranças geradas para este parcelamento no Asaas (Aumentado limit para suportar > 10 parcelas)
      const installmentsRes = await fetch(`${ASAAS_BASE_URL}/v3/payments?installment=${installmentId}&limit=100`, {
        method: 'GET',
        headers: {
          'access_token': process.env.ASAAS_API_KEY
        }
      });
      
      if (installmentsRes.ok) {
        const installmentsData = await installmentsRes.json();
        console.log(`Encontradas ${installmentsData.data.length} parcelas no Asaas.`);

        paymentsToSave = installmentsData.data
          .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
          .map(p => ({
            aluno_id: aluno_id,
            asaas_customer_id: customerId,
            asaas_payment_id: p.id,
            asaas_installment_id: installmentId,
            installment: installmentId, // Mantido para compatibilidade
            valor: p.value,
            vencimento: p.dueDate,
            link_boleto: p.bankSlipUrl
          }));
      } else {
        console.error('Falha ao buscar parcelas do installment:', installmentId);
        throw new Error('Falha ao buscar parcelas do Asaas');
      }
    } else {
       // Condição A: Salvar cobrança avulsa com installment nulo
       console.log('Detectada Cobrança Avulsa. ID:', paymentData.id);
       paymentsToSave = [{
          aluno_id: aluno_id,
          asaas_customer_id: customerId,
          asaas_payment_id: paymentData.id,
          installment: null, // Obrigatoriamente nulo
          valor: paymentData.value || valor,
          vencimento: paymentData.dueDate || vencimento,
          link_boleto: paymentData.bankSlipUrl
       }];
    }

    console.log('Enviando para o Supabase:', paymentsToSave);

    const { error: dbError } = await supabase
      .from('alunos_cobrancas')
      .insert(paymentsToSave);

    if (dbError) {
      console.error('Supabase Insert Error:', dbError);
      throw new Error('Falha ao salvar no banco de dados');
    }

    // DISPARO IMEDIATO DO WHATSAPP (Ignora race condition do webhook)
    if (paymentsToSave.length > 0) {
      const firstPaymentId = paymentsToSave[0].asaas_payment_id;
      console.log(`[Evolution] Disparando mensagem de criação imediata para ${firstPaymentId}`);
      sendEvolutionMessage(firstPaymentId, 'PAYMENT_CREATED').catch(e => console.error('Erro no disparo imediato:', e));
    }

    return res.status(200).json({ 
      success: true,
      installment: installmentId || null,
      payments: paymentsToSave,
      bankSlipUrl: paymentsToSave[0]?.link_boleto,
      paymentId: paymentsToSave[0]?.asaas_payment_id
    });

  } catch (error) {
    console.error('Function Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// ===== DISPARO EM MASSA (ANTI-BAN) =====
app.post('/api/enviar-massa', (req, res) => {
  const { alunos, mensagem } = req.body;
  
  if (!alunos || !Array.isArray(alunos) || alunos.length === 0) {
    return res.status(400).json({ error: 'Nenhum aluno válido selecionado.' });
  }

  // Responde imediatamente para não prender o Front-end
  res.status(200).json({ success: true, message: 'Processamento em background iniciado com sucesso.' });

  // Roda livre no backend
  processarFilaWhatsApp(alunos, mensagem);
});

async function processarFilaWhatsApp(alunos, mensagemTemplate) {
  console.log(`[WhatsApp em Massa] Iniciando fila para ${alunos.length} contatos...`);
  
  const { data: schoolDataObj } = await supabase.from('school_data').select('data').eq('id', 1).single();
  if (!schoolDataObj?.data) {
    return console.log('[WhatsApp em Massa] Erro: Configurações não encontradas.');
  }

  const evoConfig = schoolDataObj.data.evolutionConfig;
  if (!evoConfig?.apiUrl || !evoConfig?.apiKey || !evoConfig?.instanceName) {
    return console.log('[WhatsApp em Massa] Credenciais Evolution não configuradas.');
  }
  
  for (let i = 0; i < alunos.length; i++) {
    const aluno = alunos[i];
    const mensagemPersonalizada = mensagemTemplate.replace(/{nome}/g, aluno.nome);
    
    try {
      let cleanPhone = aluno.telefone.replace(/\D/g, '');
      if (cleanPhone.length === 10 || cleanPhone.length === 11) cleanPhone = '55' + cleanPhone;

      const payload = {
        number: cleanPhone,
        text: mensagemPersonalizada
      };

      const url = `${evoConfig.apiUrl.replace(/\/$/, '')}/message/sendText/${evoConfig.instanceName}`;
      
      const sendResp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': evoConfig.apiKey },
        body: JSON.stringify(payload)
      });
      
      if (sendResp.ok) {
        console.log(`[WhatsApp em Massa] (${i+1}/${alunos.length}) Enviado para ${aluno.nome} (${cleanPhone})`);
      } else {
        const errText = await sendResp.text();
        console.error(`[WhatsApp em Massa] (${i+1}/${alunos.length}) Erro Evolution API para ${aluno.nome}:`, sendResp.status, errText);
      }
    } catch (error) {
      console.error(`[WhatsApp em Massa] Erro Exceção ao enviar para ${aluno.nome}:`, error.message);
    }

    // Aplica o Delay Anti-Ban se NÃO for o último da fila
    if (i < alunos.length - 1) {
      // 1 a 3 minutos aleatoriamente (modificável)
      const delayMs = Math.floor(Math.random() * (180000 - 60000 + 1)) + 60000;
      console.log(`[WhatsApp em Massa] Aguardando ${(delayMs / 1000).toFixed(0)} segundos por segurança Anti-Ban...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  console.log('[WhatsApp em Massa] Fila processada/concluída com sucesso!');
}

const apiLogs = [];
function addLog(service, action, details) { 
  apiLogs.unshift({ date: new Date().toISOString(), service, action, details }); 
  if(apiLogs.length > 200) apiLogs.pop(); 
}

app.get('/api/logs', (req, res) => res.json(apiLogs));

const isUUID = (str) => typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
const formatInstallmentId = (id) => {
  if (!id) return id;
  // Corrige os 'inst_' perdidos em bases legadas
  if (id.startsWith('inst_')) return id.replace('inst_', 'ins_');
  // Se for UUID, não anexe nada! O AsaasSandbox aceita/exige UUID puro.
  return id;
};


// EXCLUSÃO EM MASSA (Asaas + EduManager)
// Regra: Apagar no Asaas PRIMEIRO. SÓ apagar do banco se o Asaas retornar sucesso.
app.post('/api/excluir_cobranca', async (req, res) => {
  try {
    const { id } = req.body;
    if (!id || typeof id !== 'string') return res.status(400).json({ error: 'ID não fornecido' });

    // Monta query segura para o Postgres (só inclui id.eq se for UUID válido)
    let queryParts = [`installment.eq.${id}`, `asaas_installment_id.eq.${id}`, `asaas_payment_id.eq.${id}`];
    if (isUUID(id)) queryParts.push(`id.eq.${id}`);
    const query = queryParts.join(',');
    
    // Busca tudo relacionado a esse ID no banco
    const { data: parcelas, error: fetchErr } = await supabase.from('alunos_cobrancas').select('*').or(query);
    if (fetchErr) {
      addLog('Supabase', 'Busca Exclusão', fetchErr.message);
      return res.status(500).json({ error: 'Erro ao buscar dados no banco.' });
    }

    // Identifica se o alvo é um carnê (não começa com pay_) ou pagamento avulso
    let isSinglePayment = id.startsWith('pay_');
    let isInstallmentPackage = !isSinglePayment;

    // ==== PASSO 1: APAGAR NO ASAAS PRIMEIRO ====
    let fallbackToDB = true;

    if (isInstallmentPackage) {
      const asaasTargetId = formatInstallmentId(id);
      console.log(`[Exclusão] Deletando parcelamento ${asaasTargetId} no Asaas...`);
      const resp = await fetch(`${ASAAS_BASE_URL}/v3/installments/${asaasTargetId}`, { 
        method: 'DELETE', 
        headers: { 'access_token': process.env.ASAAS_API_KEY } 
      });
      if (resp.ok) {
        addLog('Asaas', 'Exclusão Parcelamento OK', { id });
        fallbackToDB = false;
      } else {
        const errBody = await resp.json().catch(() => ({}));
        addLog('Asaas', 'Exclusão Parcelamento FALHOU', { id, status: resp.status, error: errBody.errors?.[0]?.description });
      }
    } else if (isSinglePayment) {
      console.log(`[Exclusão] Deletando pagamento ${id} no Asaas...`);
      const resp = await fetch(`${ASAAS_BASE_URL}/v3/payments/${id}`, { 
        method: 'DELETE', 
        headers: { 'access_token': process.env.ASAAS_API_KEY } 
      });
      if (resp.ok) {
        addLog('Asaas', 'Exclusão Pagamento OK', { id });
        fallbackToDB = false;
      } else {
        const errBody = await resp.json().catch(() => ({}));
        return res.status(400).json({ error: errBody.errors?.[0]?.description || 'Falha ao excluir pagamento avulso no Asaas.' });
      }
    }

    if (fallbackToDB && parcelas && parcelas.length > 0) {
      const instIds = new Set();
      const payIds = new Set();
      parcelas.forEach(p => {
        if (p.asaas_installment_id && p.asaas_installment_id !== '') instIds.add(p.asaas_installment_id);
        if (p.asaas_payment_id?.startsWith('pay_')) payIds.add(p.asaas_payment_id);
      });

      for (const instId of instIds) {
        if (instId === id) continue;
        const formattedLoopId = formatInstallmentId(instId);
        const resp = await fetch(`${ASAAS_BASE_URL}/v3/installments/${formattedLoopId}`, { method: 'DELETE', headers: { 'access_token': process.env.ASAAS_API_KEY } });
        if (resp.ok) addLog('Asaas', 'Exclusão OK (Resolver DB)', { instId });
        else addLog('Asaas', 'Exclusão FALHOU (Resolver DB)', { instId });
      }

      for (const payId of payIds) {
        const belongsToInst = parcelas.find(p => p.asaas_payment_id === payId && instIds.has(p.asaas_installment_id));
        if (belongsToInst && instIds.size > 0) continue;

        const resp = await fetch(`${ASAAS_BASE_URL}/v3/payments/${payId}`, { method: 'DELETE', headers: { 'access_token': process.env.ASAAS_API_KEY } });
        if (resp.ok) addLog('Asaas', 'Exclusão Pay OK (Resolver DB)', { payId });
      }
    }

    // ==== PASSO 2: APENAS REGISTRA LOG. EXCLUSÃO SERÁ FEITA VIA WEBHOOK ====
    if (parcelas && parcelas.length > 0) {
      addLog('Supabase', 'Exclusão DB ignorada (deixada para o Webhook)', { count: parcelas.length });
    }
    
    console.log(`[Exclusão] Sucesso completo para ID (Asaas excluído, DB pendente de Webhook): ${id}`);
    return res.status(200).json({ message: 'Excluído no Asaas com sucesso (Aguardando Webhook)' });
  } catch (error) { 
    addLog('Server', 'Exclusão Erro Interno', error.message);
    console.error('[Exclusão] Erro interno:', error);
    return res.status(500).json({ error: 'Erro interno ao processar exclusão.' }); 
  }
});

// IMPRIMIR CARNÊ (Prevenção contra crash)
app.get('/api/parcelamentos/:id/carne', async (req, res) => {
  try {
    const id = req.params.id;
    // Monta query segura — só inclui id.eq. se for UUID válido
    let queryParts = [`installment.eq.${id}`, `asaas_installment_id.eq.${id}`];
    if (isUUID(id)) queryParts.push(`id.eq.${id}`);
    const query = queryParts.join(',');

    const { data: parcelas, error: dbErr } = await supabase.from('alunos_cobrancas').select('*').or(query).order('vencimento', { ascending: true });
    if (dbErr) {
      addLog('Supabase', 'Busca Carnê', dbErr.message);
      return res.status(500).json({ error: 'Erro de banco.' });
    }

    let instId = (!id.startsWith('pay_')) ? id : null;
    if (!instId && parcelas?.length > 0) {
      const p = parcelas.find(x => x.asaas_installment_id);
      if (p) instId = p.asaas_installment_id;
    }

    if (instId) {
      const asaasTargetInstId = formatInstallmentId(instId);
      console.log(`[Carnê] Buscando PDF do parcelamento ${asaasTargetInstId} no Asaas...`);
      const baseUrl = ASAAS_BASE_URL;
      
      // 1. Verificar se o carnê já foi gerado e salvo no Supabase (se a coluna link_carne existir)
      const pSaved = parcelas?.find(x => x.link_carne);
      if (pSaved?.link_carne) {
        console.log(`[Carnê] Retornando PDF em cache: ${pSaved.link_carne}`);
        return res.status(200).json({ status: 'success', type: 'pdf', url: pSaved.link_carne });
      }

      // 2. Fazer GET no Asaas solicitando o paymentBook diretamente
      const ar = await fetch(`${baseUrl}/v3/installments/${asaasTargetInstId}/paymentBook`, { 
        headers: { 'access_token': process.env.ASAAS_API_KEY, 'Accept': 'application/pdf' } 
      });
      
      if (ar.ok && ar.headers.get('content-type')?.includes('pdf')) {
        console.log(`[Carnê] PDF capturado com sucesso do Asaas em formato binário.`);
        
        // 3. Lê o buffer do arquivo
        const arrayBuffer = await ar.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const fileName = `carne_${asaasTargetInstId}.pdf`;

        // 4. Upload para o Supabase Storage (bucket 'carnes')
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('carnes')
          .upload(fileName, buffer, { 
            contentType: 'application/pdf', 
            upsert: true 
          });

        if (uploadError) {
          console.error(`[Carnê] Falha no upload para o Supabase Storage:`, uploadError);
          // Se falhar o upload, retorna fallback mas loga o erro
        } else {
          // 5. Gera a Public URL
          const { data: publicUrlData } = supabase.storage.from('carnes').getPublicUrl(fileName);
          const publicUrl = publicUrlData.publicUrl;
          console.log(`[Carnê] Arquivo hospedado publicamente em:`, publicUrl);

          // 6. Tenta salvar no Banco de Dados em 'link_carne'
          const { error: dbUpdateErr } = await supabase.from('alunos_cobrancas').update({ link_carne: publicUrl }).eq('asaas_installment_id', instId);
          if (dbUpdateErr) console.warn('[Carnê] Atenção: A coluna link_carne ainda não existe ou houve erro:', dbUpdateErr.message);

          return res.status(200).json({ status: 'success', type: 'pdf', url: publicUrl });
        }
      } else {
        const errData = await ar.json().catch(()=>({}));
        console.error(`[Carnê] Asaas falhou ao buscar o arquivo binário do installment ${asaasTargetInstId}:`, errData);
      }
    }
    
    // Fallback se não der certo via PDF único: envia lista de boletos avulsos
    const boletos = parcelas ? parcelas.map((c, i) => ({ id: c.id, numero: i + 1, vencimento: c.vencimento, valor: c.valor, linkBoleto: c.link_boleto, status: c.status, asaasPaymentId: c.asaas_payment_id })) : [];
    return res.status(200).json({ status: 'success', type: 'fallback', boletos, message: 'PDF unificado não disponível. Listando boletos.' });
  } catch (error) {
    addLog('Server', 'Carnê Erro', error.message);
    return res.status(500).json({ error: 'Erro interno.' });
  }
});

app.get('/api/cobrancas/:id/link', async (req, res) => {
  try {
    const p = await fetch(`${ASAAS_BASE_URL}/v3/payments/${req.params.id}`, { headers: { 'access_token': process.env.ASAAS_API_KEY } });
    if (!p.ok) return res.status(404).json({ error: 'Não encontrada.' });
    const d = await p.json();
    return res.status(200).json({ bankSlipUrl: d.bankSlipUrl || d.invoiceUrl, transactionReceiptUrl: d.transactionReceiptUrl });
  } catch (error) { return res.status(500).json({ error: 'Erro interno.' }); }
});

app.patch('/api/alunos/:id/rematricular', async (req, res) => res.json({ success: true }));


app.put('/api/cobrancas/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { valor, vencimento } = req.body;
    let targetAsaasId = id;
    
    // Attempt mapping
    if (isUUID(id)) {
      const { data } = await supabase.from('alunos_cobrancas').select('asaas_payment_id').eq('id', id).single();
      if (data && data.asaas_payment_id) targetAsaasId = data.asaas_payment_id;
    }

    const baseUrl = ASAAS_BASE_URL;
    const aResp = await fetch(`${baseUrl}/v3/payments/${targetAsaasId}`, {
      method: 'POST', 
      headers: { 'Content-Type': 'application/json', 'access_token': process.env.ASAAS_API_KEY },
      body: JSON.stringify({ value: valor, dueDate: vencimento })
    });
    
    if (!aResp.ok) {
      const err = await aResp.json().catch(()=>({}));
      return res.status(400).json({ error: err.errors?.[0]?.description || 'Erro ao editar no Asaas' });
    }

    // Monta a query correta sem quebrar a tipagem de UUID do Supabase/Postgres
    let queryField = isUUID(id) ? 'id' : 'asaas_payment_id';
    const { error: dbErr } = await supabase
      .from('alunos_cobrancas')
      .update({ valor, vencimento })
      .eq(queryField, id);

    if (dbErr) {
      console.warn('[Edição] Cobrança atualizada no Asaas, mas falhou no Supabase local:', dbErr.message);
      // Não damos return 500 aqui para não quebrar a UI, já que a fonte da verdade atualizou
    }

    addLog('Edição', `Cobrança ${targetAsaasId}`, { valor, vencimento });
    res.json({ message: 'Editado com sucesso' });
  } catch (e) {
    addLog('Server', 'Edição Erro', e.message);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

app.get('/api/alunos/:id/carne', async (req, res) => {
  try {
    // Puxa o último carnê do aluno
    const { data: cob } = await supabase.from('alunos_cobrancas').select('*').eq('aluno_id', req.params.id).not('asaas_installment_id', 'is', null).order('created_at', { ascending: false }).limit(6);
    if (!cob || cob.length === 0) return res.status(404).json({ error: 'Nenhum carnê no sistema para este Aluno.' });
    
    const latestInstId = cob[0].asaas_installment_id;
    const asaasTargetInstId = formatInstallmentId(latestInstId);
    
    const ar = await fetch(`${ASAAS_BASE_URL}/v3/installments/${asaasTargetInstId}`, { headers: { 'access_token': process.env.ASAAS_API_KEY } });
    if (ar.ok) {
      const data = await ar.json();
      if (data.paymentBookUrl) return res.status(200).json({ status: 'success', type: 'pdf', url: data.paymentBookUrl });
    }

    const { data: allCobs } = await supabase.from('alunos_cobrancas').select('*').eq('asaas_installment_id', latestInstId).order('vencimento', { ascending: true });
    const boletos = (allCobs || []).map((c, i) => ({ id: c.id, numero: i + 1, vencimento: c.vencimento, valor: c.valor, linkBoleto: c.link_boleto, status: c.status, asaasPaymentId: c.asaas_payment_id }));
    return res.status(200).json({ status: 'success', type: 'fallback', boletos, message: 'PDF unificado não disponível. Acesse os boletos individuais.' });
  } catch (error) { return res.status(500).json({ error: 'Erro interno.' }); }
});

// INICIALIZAÇÃO HÍBRIDA (Resolve o Preview do AI Studio e o Portainer)
async function startServer() {
  const distPath = path.join(__dirname, 'dist');
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.use((req, res, next) => req.path.startsWith('/api') ? next() : res.sendFile(path.join(distPath, 'index.html')));
  } else {
    const vite = await import('vite').then(m => m.createServer({ server: { middlewareMode: true }, appType: 'spa' }));
    app.use(vite.middlewares);
  }

// Rota de Disparo Manual de Inadimplência via Evolution API
app.post('/api/disparar_cobrancas', async (req, res) => {
  try {
    const { data: atrasados, error: err } = await supabase
      .from('alunos_cobrancas')
      .select('*')
      .eq('status', 'ATRASADO');
      
    if (err) throw err;
    if (!atrasados || atrasados.length === 0) {
      return res.status(200).json({ message: 'Nenhuma cobrança atrasada encontrada.' });
    }
    
    console.log(`[Disparo] ${atrasados.length} cobranças atrasadas encontradas.`);
    
    // Dispara msg em lote com await para não ser abortado prematuramente
    let enviadas = 0;
    for (const cob of atrasados) {
      if (cob.asaas_payment_id) {
        await sendEvolutionMessage(cob.asaas_payment_id, 'PAYMENT_OVERDUE');
        enviadas++;
      }
    }
    
    return res.status(200).json({ message: `${enviadas} mensagens em processamento.` });
  } catch (error) {
    console.error('Erro no disparo manual:', error);
    return res.status(500).json({ error: 'Erro interno ao disparar cobranças.' });
  }
});
  
// NOVO ENDPOINT: Imprimir Carnê pelo UUID do Parcelamento
app.get('/api/imprimir-carne/:installmentId', async (req, res) => {
  try {
    const { installmentId } = req.params;
    const { sort, order } = req.query;

    // 1. Resolve qual é o Asaas Installment real (evita erro quando Front manda UUID local do Payment)
    let queryParts = [`installment.eq.${installmentId}`, `asaas_installment_id.eq.${installmentId}`];
    if (isUUID(installmentId)) queryParts.push(`id.eq.${installmentId}`);
    const query = queryParts.join(',');

    const { data: parcelas } = await supabase.from('alunos_cobrancas').select('*').or(query);
    let instId = (!installmentId.startsWith('pay_')) ? installmentId : null;
    
    if (!instId && parcelas?.length > 0) {
      const p = parcelas.find(x => x.asaas_installment_id);
      if (p) instId = p.asaas_installment_id;
    }
    
    // Fallback: se não achar nada, tenta a sorte com o cleanId puro
    const asaasTargetInstId = formatInstallmentId(instId || installmentId);
    console.log(`[Carnê] Buscando PDF do parcelamento ${asaasTargetInstId} no Asaas...`);

    // 2. Verifica se o Carnê já foi salvo no Supabase alguma vez (Cache)
    const pSaved = parcelas?.find(x => x.link_carne);
    if (pSaved?.link_carne) {
      console.log(`[Carnê] Retornando PDF Público do Cache (Supabase Storage): ${pSaved.link_carne}`);
      // Redireciona direto pro Supabase para performance
      return res.redirect(pSaved.link_carne);
    }

    // 3. Fazer GET no Asaas solicitando o paymentBook diretamente via Stream/ArrayBuffer
    const baseUrl = ASAAS_BASE_URL;
    let asaasUrl = `${baseUrl}/v3/installments/${asaasTargetInstId}/paymentBook`;
    
    const asaasParams = new URLSearchParams();
    if (sort) asaasParams.append('sort', sort);
    if (order) asaasParams.append('order', order);
    if (asaasParams.toString()) asaasUrl += `?${asaasParams.toString()}`;

    const response = await fetch(asaasUrl, {
      method: 'GET',
      headers: {
        'access_token': process.env.ASAAS_API_KEY,
        'Accept': 'application/pdf'
      }
    });

    if (response.ok && response.headers.get('content-type')?.includes('pdf')) {
      console.log(`[Carnê] Arquivo binário recebido do Asaas. Iniciando upload para o Supabase...`);
      
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const fileName = `carne_${asaasTargetInstId}.pdf`;

      // Subindo assíncrono para o Storage Supabase
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('carnes')
        .upload(fileName, buffer, { contentType: 'application/pdf', upsert: true });

      if (!uploadError) {
        const { data: publicUrlData } = supabase.storage.from('carnes').getPublicUrl(fileName);
        const publicUrl = publicUrlData.publicUrl;
        console.log(`[Carnê] Link Público Supabase gerado:`, publicUrl);

        // Atualiza a tabela (não bloqueia a response)
        supabase.from('alunos_cobrancas').update({ link_carne: publicUrl }).eq('asaas_installment_id', instId).then(({ error }) => {
          if (error) console.warn('[Carnê] Atenção: Erro ao injetar link_carne no BD:', error.message);
        });
      }

      // Exibindo imediato na aba do cliente
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline; filename="carne.pdf"');
      return res.send(buffer);
    } else {
      const errorText = await response.text();
      console.error(`[Carnê] Falha no Asaas:`, errorText);
      return res.status(response.status).send('Falha ao obter o Carnê no Asaas: ' + errorText);
    }
  } catch (error) {
    console.error('Erro geral ao processar PDF do carnê:', error);
    return res.status(500).json({ error: 'Erro interno na hospedagem de PDF.' });
  }
});
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Servidor na porta ${PORT}`));
}
startServer();
