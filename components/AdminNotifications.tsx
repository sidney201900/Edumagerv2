import React, { useState, useEffect, useRef } from 'react';
import { Bell, X, CheckCircle, Trash2, ShieldCheck, FileText, Paperclip } from 'lucide-react';
import { SchoolData, Notification, View } from '../types';
import { dbService } from '../services/dbService';

interface Props {
  data: SchoolData;
  updateData: (newData: Partial<SchoolData>) => void;
  setView: (view: View) => void;
}

const AdminNotifications: React.FC<Props> = ({ data, updateData, setView }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [viewingAttachment, setViewingAttachment] = useState<string | null>(null);
  const [notifWithAttachment, setNotifWithAttachment] = useState<Notification | null>(null);
  const prevCountRef = useRef<number>(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleDeleteAttachment = () => {
    if (!notifWithAttachment) return;
    
    const updatedNotifs = (data.notifications || []).map(n => 
      n.id === notifWithAttachment.id ? { ...n, attachment: undefined } : n
    );
    
    updateData({ notifications: updatedNotifs });
    dbService.saveData({ ...data, notifications: updatedNotifs });
    setViewingAttachment(null);
    setNotifWithAttachment(null);
  };

  const adminNotifs = (data.notifications || []).filter(n => n.studentId === 'admin').sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const unreadCount = adminNotifs.filter(n => !n.read).length;

  // Som de notificação quando chega uma nova
  useEffect(() => {
    if (unreadCount > prevCountRef.current && prevCountRef.current >= 0) {
      try {
        if (!audioRef.current) {
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const oscillator = ctx.createOscillator();
          const gainNode = ctx.createGain();
          oscillator.connect(gainNode);
          gainNode.connect(ctx.destination);
          oscillator.type = 'sine';
          oscillator.frequency.setValueAtTime(880, ctx.currentTime);
          oscillator.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
          oscillator.frequency.setValueAtTime(880, ctx.currentTime + 0.2);
          gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
          oscillator.start(ctx.currentTime);
          oscillator.stop(ctx.currentTime + 0.4);
        }
      } catch(e) {
        console.warn('Som de notificação indisponível', e);
      }
    }
    prevCountRef.current = unreadCount;
  }, [unreadCount]);

  const handleAction = (notif: Notification) => {
    if (!notif.read) handleMarkAsRead(notif.id);
    
    if (notif.title.toLowerCase().includes('justificativa') || notif.message.toLowerCase().includes('justificativa')) {
      setView(View.AttendanceQuery);
      setIsOpen(false);
    }
  };

  const handleMarkAsRead = (id: string) => {
    const updatedAll = (data.notifications || []).map(n => 
      n.id === id ? { ...n, read: true } : n
    );
    updateData({ notifications: updatedAll });
    dbService.saveData({ ...data, notifications: updatedAll });
  };

  const handleClearRead = () => {
    const others = (data.notifications || []).filter(n => n.studentId !== 'admin' || (n.studentId === 'admin' && !n.read));
    updateData({ notifications: others });
    dbService.saveData({ ...data, notifications: others });
  };

  // Aceitar justificativa diretamente pela notificação
  const handleAcceptJustification = (notif: Notification) => {
    // Procura registros de falta pendentes de aceitação
    const pendingAbsences = (data.attendance || []).filter(a => 
      a.type === 'absence' && a.justification && !a.justificationAccepted
    );
    
    if (pendingAbsences.length > 0) {
      // Tenta achar pelo studentId mencionado na mensagem ou aceita o mais recente
      const matchedAbsence = pendingAbsences[0]; // aceita o mais recente pendente
      
      const updatedAttendance = (data.attendance || []).map(a => 
        a.id === matchedAbsence.id ? { ...a, justificationAccepted: true } : a
      );
      const updatedNotifs = (data.notifications || []).map(n => 
        n.id === notif.id ? { ...n, read: true } : n
      );
      
      updateData({ attendance: updatedAttendance, notifications: updatedNotifs });
      dbService.saveData({ ...data, attendance: updatedAttendance, notifications: updatedNotifs });
    } else {
      // Se não encontrou pendentes, apenas marca como lida
      handleMarkAsRead(notif.id);
    }
  };

  return (
    <div className="fixed top-4 right-16 md:top-6 md:right-8 z-50">
      <button 
        onClick={() => setIsOpen(!isOpen)} 
        className={`relative p-2.5 rounded-full shadow-lg border transition-all ${
          unreadCount > 0 
            ? 'bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100 hover:shadow-xl shadow-amber-100' 
            : 'bg-white text-slate-600 border-slate-100 hover:text-indigo-600 hover:shadow-xl'
        }`}
        title="Notificações do Sistema"
      >
        <Bell size={22} className={unreadCount > 0 ? "animate-bounce" : ""} />
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-black w-5 h-5 flex items-center justify-center rounded-full border-2 border-white shadow-sm animate-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute top-14 right-0 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in slide-in-from-top-4 fade-in duration-200 flex flex-col max-h-[80vh]">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between sticky top-0 z-10">
            <div>
              <h3 className="font-black text-slate-800 flex items-center gap-2">Avaliações Pendentes
                {unreadCount > 0 && <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full text-[10px] font-bold">{unreadCount}</span>}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleClearRead} className="p-1.5 text-slate-400 hover:bg-slate-200 hover:text-red-500 rounded-lg transition-colors" title="Limpar Lidas">
                <Trash2 size={16} />
              </button>
              <button onClick={() => setIsOpen(false)} className="p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 rounded-lg transition-colors">
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="overflow-y-auto p-2 flex-1 relative">
            {adminNotifs.length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                <Bell size={32} className="mx-auto mb-2 opacity-20" />
                <p className="text-sm font-bold">Nenhuma notificação</p>
                <p className="text-xs mt-1">Sua caixa de entrada está limpa.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {adminNotifs.map(notif => {
                  const isJustificativa = notif.title.toLowerCase().includes('justificativa') || notif.message.toLowerCase().includes('justificativa');
                  
                  let displayMessage = notif.message;
                  let attachmentFromMessage = null;
                  
                  if (notif.message.startsWith('{')) {
                    try {
                      const parsed = JSON.parse(notif.message);
                      displayMessage = parsed.motivo || displayMessage;
                      attachmentFromMessage = parsed.arquivo_base64 || null;
                    } catch(e) {}
                  }

                  const finalAttachment = notif.attachment || attachmentFromMessage;

                  return (
                    <div key={notif.id} onClick={() => handleAction(notif)} className={`p-3 rounded-xl border transition-all cursor-pointer relative overflow-hidden group ${notif.read ? 'bg-slate-50 border-transparent opacity-70' : 'bg-white border-indigo-100 hover:border-indigo-300 shadow-sm'}`}>
                      {!notif.read && <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500"></div>}
                      <div className="flex justify-between items-start mb-1 gap-4">
                        <h4 className={`text-sm font-bold ${notif.read ? 'text-slate-600' : 'text-slate-900'}`}>{notif.title}</h4>
                        <span className="text-[9px] font-bold text-slate-400 whitespace-nowrap bg-slate-100 px-1.5 py-0.5 rounded">{new Date(notif.createdAt).toLocaleDateString('pt-BR')}</span>
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed mb-2">{displayMessage}</p>
                      {(!notif.read) && (
                        <div className="flex justify-end mt-2 gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          {finalAttachment && (
                            <button 
                              onClick={(e) => { 
                                e.stopPropagation(); 
                                setViewingAttachment(finalAttachment);
                                setNotifWithAttachment(notif);
                              }}
                              className="text-[10px] font-black uppercase text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded-lg flex items-center gap-1 transition-colors"
                            >
                              <Paperclip size={12} /> Ver Anexo
                            </button>
                          )}
                          {isJustificativa && (
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleAcceptJustification(notif); }}
                              className="text-[10px] font-black uppercase text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-2 py-1 rounded-lg flex items-center gap-1 transition-colors"
                            >
                              <ShieldCheck size={12} /> Aceitar
                            </button>
                          )}
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleMarkAsRead(notif.id); }}
                            className="text-[10px] font-black uppercase text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded-lg flex items-center gap-1 transition-colors"
                          >
                            <CheckCircle size={12} /> Lida
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {viewingAttachment && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b flex items-center justify-between bg-slate-50">
              <h3 className="font-black text-slate-800 flex items-center gap-2">
                <FileText size={20} className="text-indigo-600" /> Visualização do Documento
              </h3>
              <div className="flex items-center gap-2">
                <button 
                  onClick={handleDeleteAttachment}
                  className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-bold hover:bg-red-100 flex items-center gap-1.5 transition-colors"
                >
                  <Trash2 size={14} /> Excluir Arquivo
                </button>
                <button 
                  onClick={() => { setViewingAttachment(null); setNotifWithAttachment(null); }}
                  className="p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-700 rounded-lg transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto bg-slate-200 p-4 flex items-center justify-center">
              {viewingAttachment.startsWith('data:application/pdf') || viewingAttachment.includes('.pdf') ? (
                <iframe src={viewingAttachment} className="w-full h-full min-h-[70vh] rounded-lg shadow-sm bg-white" />
              ) : (
                <img src={viewingAttachment} className="max-w-full max-h-full object-contain rounded-lg shadow-sm" alt="Documento" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminNotifications;
