import React, { createContext, useContext, useState, ReactNode } from 'react';
import { AlertTriangle, CheckCircle, Info, XCircle } from 'lucide-react';

type DialogType = 'alert' | 'confirm' | 'success' | 'error' | 'warning' | 'info';

interface DialogOptions {
  title: string;
  message: string;
  type?: DialogType;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
}

interface DialogContextType {
  showAlert: (title: string, message: string, type?: DialogType) => void;
  showConfirm: (title: string, message: string, onConfirm: () => void, type?: DialogType) => void;
}

const DialogContext = createContext<DialogContextType | undefined>(undefined);

export const useDialog = () => {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error('useDialog must be used within a DialogProvider');
  }
  return context;
};

export const DialogProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<DialogOptions | null>(null);
  const [isClosing, setIsClosing] = useState(false);

  const closeDialog = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsOpen(false);
      setOptions(null);
      setIsClosing(false);
    }, 400);
  };

  const showAlert = (title: string, message: string, type: DialogType = 'info') => {
    setOptions({ title, message, type, confirmLabel: 'OK' });
    setIsOpen(true);
  };

  const showConfirm = (title: string, message: string, onConfirm: () => void, type: DialogType = 'warning') => {
    setOptions({ 
      title, 
      message, 
      type, 
      confirmLabel: 'Confirmar', 
      cancelLabel: 'Cancelar',
      onConfirm: () => {
        onConfirm();
        closeDialog();
      },
      onCancel: closeDialog
    });
    setIsOpen(true);
  };

  const getIcon = (type?: DialogType) => {
    switch (type) {
      case 'success': return <CheckCircle className="text-emerald-500" size={24} />;
      case 'error': return <XCircle className="text-red-500" size={24} />;
      case 'warning': return <AlertTriangle className="text-amber-500" size={24} />;
      case 'alert': return <AlertTriangle className="text-red-500" size={24} />;
      default: return <Info className="text-indigo-500" size={24} />;
    }
  };

  const getIconBg = (type?: DialogType) => {
    switch (type) {
      case 'success': return 'bg-emerald-100';
      case 'error': return 'bg-red-100';
      case 'warning': return 'bg-amber-100';
      case 'alert': return 'bg-red-100';
      default: return 'bg-indigo-100';
    }
  };

  return (
    <DialogContext.Provider value={{ showAlert, showConfirm }}>
      {children}
      {isOpen && options && (
        <div className={`fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100] transition-opacity duration-400 ${isClosing ? 'opacity-0' : 'opacity-100 animate-in fade-in'}`}>
          <div className={`bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl transition-all duration-400 ${isClosing ? 'animate-slide-down-fade-out' : 'animate-slide-up'}`}>
            <div className="h-2 bg-indigo-600 w-full"></div>
            <div className="p-6 text-center">
              <div className={`w-12 h-12 ${getIconBg(options.type)} rounded-full flex items-center justify-center mx-auto mb-4`}>
                {getIcon(options.type)}
              </div>
              <h3 className="text-lg font-black text-slate-800 mb-2">{options.title}</h3>
              <p className="text-sm text-slate-500 mb-6 whitespace-pre-wrap">{options.message}</p>
              <div className="flex gap-3">
                {options.cancelLabel && (
                  <button 
                    onClick={options.onCancel} 
                    className="flex-1 py-3 border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    {options.cancelLabel}
                  </button>
                )}
                <button 
                  onClick={options.onConfirm || closeDialog} 
                  className={`flex-1 py-3 text-white rounded-xl font-bold transition-all shadow-lg ${
                    options.type === 'error' || options.type === 'alert' || options.type === 'warning' 
                    ? 'bg-red-600 hover:bg-red-700 shadow-red-100' 
                    : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-100'
                  }`}
                >
                  {options.confirmLabel}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
};
