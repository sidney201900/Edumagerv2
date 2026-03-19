import React, { useState } from 'react';
import { SchoolData, Employee, EmployeeCategory } from '../types';
import { Plus, Edit2, Trash2, X, Search, Users, Briefcase, Calendar, Phone, Mail, FileText, Settings2 } from 'lucide-react';
import { useDialog } from '../DialogContext';

interface EmployeesProps {
  data: SchoolData;
  updateData: (newData: Partial<SchoolData>) => void;
}

const Employees: React.FC<EmployeesProps> = ({ data, updateData }) => {
  const { showAlert, showConfirm } = useDialog();
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [editingCategory, setEditingCategory] = useState<EmployeeCategory | null>(null);

  const [formData, setFormData] = useState<Omit<Employee, 'id'>>({
    name: '',
    cpf: '',
    phone: '',
    email: '',
    admissionDate: new Date().toISOString().split('T')[0],
    categoryId: ''
  });

  const [categoryFormData, setCategoryFormData] = useState({ name: '' });

  const employees = data.employees || [];
  const categories = data.employeeCategories || [];

  const filteredEmployees = employees.filter(emp =>
    (emp.name || '').toLowerCase().includes((searchTerm || '').toLowerCase()) ||
    (emp.cpf || '').includes(searchTerm || '') ||
    (emp.email || '').toLowerCase().includes((searchTerm || '').toLowerCase())
  );

  const closeModal = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsModalOpen(false);
      setIsClosing(false);
      setEditingEmployee(null);
      setFormData({
        name: '',
        cpf: '',
        phone: '',
        email: '',
        admissionDate: new Date().toISOString().split('T')[0],
        categoryId: ''
      });
    }, 400);
  };

  const closeCategoryModal = () => {
    setIsCategoryModalOpen(false);
    setEditingCategory(null);
    setCategoryFormData({ name: '' });
  };

  const handleEdit = (emp: Employee) => {
    setEditingEmployee(emp);
    setFormData({
      name: emp.name,
      cpf: emp.cpf,
      phone: emp.phone,
      email: emp.email,
      admissionDate: emp.admissionDate,
      categoryId: emp.categoryId
    });
    setIsModalOpen(true);
  };

  const handleDelete = (emp: Employee) => {
    showConfirm(
      'Remover Funcionário',
      `Tem certeza que deseja remover ${emp.name}?`,
      () => {
        const updatedEmployees = employees.filter(e => e.id !== emp.id);
        updateData({ employees: updatedEmployees });
        showAlert('Sucesso', 'Funcionário removido com sucesso.', 'success');
      }
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.categoryId) {
      showAlert('Atenção', 'Selecione uma categoria para o funcionário.', 'warning');
      return;
    }

    if (editingEmployee) {
      const updatedEmployees = employees.map(emp =>
        emp.id === editingEmployee.id ? { ...formData, id: emp.id } : emp
      );
      updateData({ employees: updatedEmployees });
      showAlert('Sucesso', 'Funcionário atualizado com sucesso.', 'success');
    } else {
      const newEmployee: Employee = {
        ...formData,
        id: crypto.randomUUID()
      };
      updateData({ employees: [...employees, newEmployee] });
      showAlert('Sucesso', 'Funcionário cadastrado com sucesso.', 'success');
    }
    closeModal();
  };

  const handleCategorySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryFormData.name.trim()) return;

    if (editingCategory) {
      const updatedCategories = categories.map(cat =>
        cat.id === editingCategory.id ? { ...cat, name: categoryFormData.name } : cat
      );
      updateData({ employeeCategories: updatedCategories });
    } else {
      const newCategory: EmployeeCategory = {
        id: crypto.randomUUID(),
        name: categoryFormData.name
      };
      updateData({ employeeCategories: [...categories, newCategory] });
    }
    setCategoryFormData({ name: '' });
    setEditingCategory(null);
  };

  const handleDeleteCategory = (cat: EmployeeCategory) => {
    const hasEmployees = employees.some(emp => emp.categoryId === cat.id);
    if (hasEmployees) {
      showAlert('Atenção', 'Não é possível excluir uma categoria que possui funcionários vinculados.', 'warning');
      return;
    }

    showConfirm(
      'Remover Categoria',
      `Deseja remover a categoria "${cat.name}"?`,
      () => {
        const updatedCategories = categories.filter(c => c.id !== cat.id);
        updateData({ employeeCategories: updatedCategories });
      }
    );
  };

  const inputClass = "w-full px-4 py-3 bg-white text-black border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm";

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Funcionários</h2>
          <p className="text-slate-500">Gerencie sua equipe e categorias profissionais.</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <button
            onClick={() => setIsCategoryModalOpen(true)}
            className="flex-1 md:flex-none bg-white text-slate-700 px-6 py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-slate-50 transition-all shadow-sm border border-slate-200 font-bold"
          >
            <Settings2 size={20} /> Categorias
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex-1 md:flex-none bg-indigo-600 text-white px-6 py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-indigo-700 transition-all shadow-lg font-bold"
          >
            <Plus size={20} /> Novo Funcionário
          </button>
        </div>
      </div>

      {/* Search and Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={20} />
          <input
            type="text"
            placeholder="Buscar por nome, CPF ou e-mail..."
            className="w-full pl-12 pr-4 py-4 bg-white border border-slate-200 rounded-2xl shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600">
            <Users size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Equipe</p>
            <p className="text-2xl font-black text-slate-900">{employees.length}</p>
          </div>
        </div>
      </div>

      {/* Employees Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredEmployees.map(emp => {
          const category = categories.find(c => c.id === emp.categoryId);
          return (
            <div key={emp.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all group overflow-hidden">
              <div className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                    <Users size={24} />
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleEdit(emp)}
                      className="p-2 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 transition-all"
                    >
                      <Edit2 size={18} />
                    </button>
                    <button
                      onClick={() => handleDelete(emp)}
                      className="p-2 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-all"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>

                <h3 className="text-lg font-black text-slate-900 mb-1">{emp.name}</h3>
                <span className="inline-block px-2 py-1 bg-indigo-50 text-indigo-600 text-[10px] font-black uppercase rounded-md mb-4">
                  {category?.name || 'Sem Categoria'}
                </span>

                <div className="space-y-2 text-sm text-slate-600">
                  <div className="flex items-center gap-2">
                    <FileText size={14} className="text-slate-400" />
                    <span>CPF: {emp.cpf}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone size={14} className="text-slate-400" />
                    <span>{emp.phone}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Mail size={14} className="text-slate-400" />
                    <span className="truncate">{emp.email}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar size={14} className="text-slate-400" />
                    <span>Admissão: {new Date(emp.admissionDate).toLocaleDateString('pt-BR')}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {employees.length === 0 && (
        <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl p-12 text-center">
          <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
            <Users size={40} />
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-2">Nenhum funcionário cadastrado</h3>
          <p className="text-slate-500 mb-6">Comece adicionando os membros da sua equipe.</p>
          <button
            onClick={() => setIsModalOpen(true)}
            className="bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg"
          >
            Cadastrar Primeiro Funcionário
          </button>
        </div>
      )}

      {/* Employee Modal */}
      {isModalOpen && (
        <div className={`fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto transition-opacity duration-400 ${isClosing ? 'opacity-0' : 'opacity-100 animate-in fade-in'}`}>
          <div className={`bg-white rounded-xl w-full max-w-2xl shadow-2xl my-auto transition-all duration-400 relative overflow-hidden ${isClosing ? 'animate-slide-down-fade-out' : 'animate-slide-up'}`}>
            <div className="bg-indigo-600 h-1.5 w-full absolute top-0 left-0 z-10"></div>
            
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-indigo-50/30">
              <div>
                <h3 className="text-xl font-black text-slate-800 tracking-tight">
                  {editingEmployee ? 'Editar Funcionário' : 'Novo Funcionário'}
                </h3>
                <p className="text-xs text-slate-500">Preencha os dados profissionais.</p>
              </div>
              <button onClick={closeModal} className="p-2 bg-white text-slate-400 hover:text-red-500 rounded-lg shadow-sm transition-all hover:rotate-90">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Nome Completo</label>
                <input
                  required
                  className={inputClass}
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">CPF</label>
                <input
                  required
                  className={inputClass}
                  placeholder="000.000.000-00"
                  value={formData.cpf}
                  onChange={e => {
                    const val = e.target.value.replace(/\D/g, '').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})/, '$1-$2').slice(0, 14);
                    setFormData({ ...formData, cpf: val });
                  }}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Categoria</label>
                <select
                  required
                  className={inputClass}
                  value={formData.categoryId}
                  onChange={e => setFormData({ ...formData, categoryId: e.target.value })}
                >
                  <option value="">Selecione...</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Telefone</label>
                <input
                  required
                  className={inputClass}
                  placeholder="(00) 00000-0000"
                  value={formData.phone}
                  onChange={e => {
                    const val = e.target.value.replace(/\D/g, '').replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2').slice(0, 15);
                    setFormData({ ...formData, phone: val });
                  }}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">E-mail</label>
                <input
                  type="email"
                  required
                  className={inputClass}
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Data de Admissão</label>
                <input
                  type="date"
                  required
                  className={inputClass}
                  value={formData.admissionDate}
                  onChange={e => setFormData({ ...formData, admissionDate: e.target.value })}
                />
              </div>

              <div className="md:col-span-2 pt-4 flex gap-3">
                <button type="button" onClick={closeModal} className="flex-1 py-3 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 font-bold text-sm">
                  Cancelar
                </button>
                <button type="submit" className="flex-1 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 shadow-lg font-bold text-sm">
                  {editingEmployee ? 'Atualizar' : 'Cadastrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Categories Modal */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto animate-in fade-in">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl relative overflow-hidden animate-slide-up">
            <div className="bg-indigo-600 h-1.5 w-full absolute top-0 left-0"></div>
            
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-xl font-black text-slate-800 tracking-tight">Gerenciar Categorias</h3>
              <button onClick={closeCategoryModal} className="p-2 text-slate-400 hover:text-red-500 transition-all">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <form onSubmit={handleCategorySubmit} className="flex gap-2">
                <input
                  placeholder="Nova categoria (ex: Professor)"
                  className={`${inputClass} flex-1`}
                  value={categoryFormData.name}
                  onChange={e => setCategoryFormData({ name: e.target.value })}
                />
                <button type="submit" className="bg-indigo-600 text-white p-3 rounded-xl hover:bg-indigo-700 transition-all shadow-md">
                  <Plus size={20} />
                </button>
              </form>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                {categories.map(cat => (
                  <div key={cat.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl group">
                    <span className="font-bold text-slate-700">{cat.name}</span>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => {
                          setEditingCategory(cat);
                          setCategoryFormData({ name: cat.name });
                        }}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-white transition-all"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteCategory(cat)}
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-white transition-all"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
                {categories.length === 0 && (
                  <p className="text-center text-slate-400 text-sm py-4 italic">Nenhuma categoria cadastrada.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Employees;
