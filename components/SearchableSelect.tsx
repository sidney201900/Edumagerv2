import React, { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, X } from 'lucide-react';

interface Option {
  id: string;
  name: string;
  subtext?: string;
}

interface SearchableSelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  required?: boolean;
}

const SearchableSelect: React.FC<SearchableSelectProps> = ({ 
  options, 
  value, 
  onChange, 
  placeholder, 
  label,
  required = false 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  
  const selectedOption = options.find(opt => opt.id === value);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = options.filter(opt => 
    (opt.name || '').toLowerCase().includes((searchTerm || '').toLowerCase()) ||
    (opt.subtext && (opt.subtext || '').toLowerCase().includes((searchTerm || '').toLowerCase()))
  );

  return (
    <div className="relative" ref={containerRef}>
      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 ml-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full px-4 py-3 bg-slate-50 border ${isOpen ? 'border-indigo-500 ring-2 ring-indigo-500/10' : 'border-slate-200'} rounded-xl cursor-pointer flex items-center justify-between transition-all text-sm`}
      >
        <span className={selectedOption ? 'text-slate-800 font-medium' : 'text-slate-400'}>
          {selectedOption ? selectedOption.name : placeholder}
        </span>
        <ChevronDown size={18} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {isOpen && (
        <div className="absolute z-[110] w-full mt-2 bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          <div className="p-3 border-b border-slate-100 bg-slate-50">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                autoFocus
                type="text"
                className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                placeholder="Pesquisar..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>
          
          <div className="max-h-60 overflow-y-auto custom-scrollbar">
            {filteredOptions.length > 0 ? (
              filteredOptions.map(option => (
                <div
                  key={option.id}
                  onClick={() => {
                    onChange(option.id);
                    setIsOpen(false);
                    setSearchTerm('');
                  }}
                  className={`px-4 py-3 hover:bg-indigo-50 cursor-pointer transition-colors flex flex-col ${value === option.id ? 'bg-indigo-50 border-l-4 border-indigo-600' : ''}`}
                >
                  <span className={`text-sm ${value === option.id ? 'font-bold text-indigo-600' : 'font-medium text-slate-700'}`}>
                    {option.name}
                  </span>
                  {option.subtext && (
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
                      {option.subtext}
                    </span>
                  )}
                </div>
              ))
            ) : (
              <div className="px-4 py-6 text-center text-slate-400 text-sm italic">
                Nenhum resultado encontrado.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchableSelect;
