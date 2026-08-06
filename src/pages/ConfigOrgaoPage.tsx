import React, { useState, useEffect } from "react";
import { 
  Building2, 
  Upload, 
  Trash2, 
  Save, 
  RotateCcw, 
  CheckCircle2, 
  AlertCircle, 
  FileText, 
  Smartphone, 
  Image as ImageIcon,
  Shield,
  HelpCircle
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { 
  OrgaoConfig, 
  getOrgaoConfig, 
  saveOrgaoConfig, 
  resetOrgaoConfig, 
  loadOrgaoConfigFromSupabase,
  DEFAULT_ORGAO_CONFIG,
  updateAppFavicon 
} from "../services/orgaoService";
import { isSupabaseConfigured } from "../services/supabase";

export const ConfigOrgaoPage: React.FC = () => {
  const { user } = useAuth();
  const [formData, setFormData] = useState<OrgaoConfig>(DEFAULT_ORGAO_CONFIG);
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    const loaded = getOrgaoConfig();
    setFormData(loaded);

    if (isSupabaseConfigured()) {
      loadOrgaoConfigFromSupabase().then((remoteConfig) => {
        if (remoteConfig) {
          setFormData(remoteConfig);
        }
      }).catch(() => {});
    }
  }, []);

  const handleChange = (field: keyof OrgaoConfig, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setIsSaved(false);
  };

  const handleFileUpload = (file: File) => {
    setErrorMessage(null);
    if (!file.type.startsWith("image/")) {
      setErrorMessage("Por favor, selecione um arquivo de imagem válido (PNG, JPG, WebP ou SVG).");
      return;
    }

    if (file.size > 3 * 1024 * 1024) {
      setErrorMessage("A imagem selecionada é muito grande. Escolha uma imagem de até 3MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      if (base64) {
        setFormData((prev) => ({ ...prev, logo: base64 }));
        setIsSaved(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleRemoveLogo = () => {
    setFormData((prev) => ({ ...prev, logo: "" }));
    setIsSaved(false);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSaving(true);
    setErrorMessage(null);
    setIsSaved(false);

    try {
      await saveOrgaoConfig(formData);
      setIsSaved(true);
      setShowSuccessToast(true);
      setErrorMessage(null);
      setTimeout(() => {
        setIsSaved(false);
        setShowSuccessToast(false);
      }, 5000);
    } catch (err: any) {
      console.error("Erro ao salvar orgaoConfig:", err);
      setErrorMessage("Erro ao salvar configurações: " + (err?.message || "Tente novamente."));
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetDefaults = async () => {
    if (window.confirm("Deseja realmente restaurar as configurações padrão do DETRAN/PA?")) {
      setIsSaving(true);
      try {
        const reseted = await resetOrgaoConfig();
        setFormData(reseted);
        setIsSaved(true);
        setShowSuccessToast(true);
        setTimeout(() => {
          setIsSaved(false);
          setShowSuccessToast(false);
        }, 4000);
      } catch (err: any) {
        setErrorMessage("Erro ao restaurar configurações: " + (err?.message || "Tente novamente."));
      } finally {
        setIsSaving(false);
      }
    }
  };

  const canManage = !user || user?.perfil === "Administrador" || user?.perfil === "Supervisor" || user?.perfil === "Operador";

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-200">
      {/* Cabeçalho da Página */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-blue-600/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 rounded-2xl shrink-0">
            <Building2 className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                Configuração do Órgão (DETRAN)
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                PDFs & Ícone do App
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
              Gerencie a logomarca oficial, nomes institucionais e unidades padrão. A logomarca enviada aqui será automaticamente estampada no <strong>cabeçalho de todos os PDFs</strong> e configurada como <strong>ícone do aplicativo ao salvar como atalho no celular/computador</strong>.
            </p>
          </div>
        </div>

        {canManage && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={isSaving}
              onClick={handleResetDefaults}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 rounded-xl transition-all cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restaurar Padrão</span>
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={() => handleSubmit()}
              className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-xl shadow-md hover:shadow-lg transition-all cursor-pointer active:scale-95"
            >
              {isSaving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Salvando...</span>
                </>
              ) : isSaved ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                  <span>Salvo com Sucesso!</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Salvar Alterações</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Alertas de Mensagens */}
      {isSaved && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-200 dark:border-emerald-800/80 rounded-2xl flex items-center gap-3 text-emerald-800 dark:text-emerald-200 text-xs font-medium animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>Configurações do Órgão e Logomarca salvas com sucesso! Todos os PDFs gerados e o ícone do aplicativo foram atualizados.</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/70 border border-rose-200 dark:border-rose-800/80 rounded-2xl flex items-center gap-3 text-rose-800 dark:text-rose-200 text-xs font-medium">
          <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Lado Esquerdo: Upload de Logomarca e Preview do Ícone */}
        <div className="lg:col-span-5 space-y-6">
          {/* Card: Logomarca e Ícone do Atalho */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  Logomarca do Órgão
                </h2>
              </div>
              <span className="text-[11px] font-semibold text-slate-500">PNG / JPG / SVG</span>
            </div>

            {/* Dropzone de Upload */}
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all flex flex-col items-center justify-center relative ${
                dragActive
                  ? "border-blue-500 bg-blue-50/50 dark:bg-blue-950/30"
                  : formData.logo
                  ? "border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50"
                  : "border-slate-300 dark:border-slate-700 hover:border-blue-400 bg-slate-50/30 dark:bg-slate-800/30"
              }`}
            >
              {formData.logo ? (
                <div className="space-y-3 w-full flex flex-col items-center">
                  <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm max-w-[200px]">
                    <img
                      src={formData.logo}
                      alt="Logomarca do Órgão"
                      className="max-h-28 w-auto object-contain mx-auto"
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-2">
                    <label
                      htmlFor="logo-upload-input"
                      className="px-3 py-1.5 text-xs font-semibold bg-blue-50 hover:bg-blue-100 dark:bg-blue-950 dark:hover:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-lg cursor-pointer transition-colors"
                    >
                      Alterar Imagem
                    </label>
                    <button
                      type="button"
                      onClick={handleRemoveLogo}
                      className="px-3 py-1.5 text-xs font-semibold bg-rose-50 hover:bg-rose-100 dark:bg-rose-950 dark:hover:bg-rose-900 text-rose-700 dark:text-rose-300 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Remover</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="w-12 h-12 bg-blue-100 dark:bg-blue-950/80 rounded-2xl flex items-center justify-center text-blue-600 dark:text-blue-400 mx-auto shadow-xs">
                    <Upload className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Arraste e solte a imagem do DETRAN aqui
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">ou clique no botão abaixo para buscar no seu dispositivo</p>
                  </div>
                  <label
                    htmlFor="logo-upload-input"
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-xl cursor-pointer shadow-xs transition-all mt-2"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Selecionar Logomarca</span>
                  </label>
                </div>
              )}

              <input
                id="logo-upload-input"
                type="file"
                accept="image/png, image/jpeg, image/webp, image/svg+xml"
                className="hidden"
                disabled={!canManage}
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileUpload(e.target.files[0]);
                  }
                }}
              />
            </div>

            {/* Simulação Visual do Ícone de Atalho no Celular / PWA */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2 mb-2">
                <Smartphone className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Prévia do Ícone de Atalho (Mobile / PWA)
                </span>
              </div>
              <div className="p-3 bg-slate-100 dark:bg-slate-800/70 rounded-xl flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-700 flex items-center justify-center overflow-hidden shadow-md shrink-0">
                  {formData.logo ? (
                    <img src={formData.logo} alt="Ícone do App" className="w-9 h-9 object-contain" />
                  ) : (
                    <div className="w-full h-full bg-blue-600 text-white font-black text-lg flex items-center justify-center">
                      D
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900 dark:text-white">
                    {formData.sigla || "DETRAN"} Protocolo
                  </p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">
                    Ao "Adicionar à Tela Inicial", este será o ícone exibido no seu smartphone.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Card: Simulação do Cabeçalho Oficial do PDF */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  Prévia do Cabeçalho em Documentos PDF
                </h3>
              </div>
            </div>

            <div className="bg-white text-slate-900 p-4 rounded-xl border border-slate-300 shadow-inner font-sans text-center relative overflow-hidden">
              <div className="flex items-center justify-center gap-3 mb-2">
                {formData.logo && (
                  <img src={formData.logo} alt="Logo PDF" className="h-10 w-auto object-contain" />
                )}
                <div className="text-center">
                  <h4 className="text-xs font-bold tracking-tight text-slate-900 leading-tight">
                    {formData.governo || "GOVERNO DO ESTADO"}
                  </h4>
                  <p className="text-[10px] font-semibold text-slate-700 leading-tight">
                    {formData.secretaria || "SECRETARIA DE ESTADO"}
                  </p>
                  <p className="text-[10px] font-bold text-slate-800 leading-tight">
                    {formData.orgao || "DEPARTAMENTO DE TRÂNSITO"}
                  </p>
                </div>
              </div>
              <div className="w-full h-0.5 bg-slate-800 my-2"></div>
              <p className="text-[9px] font-bold text-slate-800 uppercase">
                Memorando Nº: 042/2026 - {formData.sigla || "DETRAN"}
              </p>
              <p className="text-[8px] text-slate-600">
                {formData.origem_padrao} → {formData.destino_padrao}
              </p>
            </div>
          </div>
        </div>

        {/* Lado Direito: Formulário de Campos do Órgão */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5 shadow-xs">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Shield className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Dados Institucionais do Órgão</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Valores oficiais gravados no cabeçalho e rodapé dos memorandos, protocolo geral e relatórios setoriais.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Esfera / Governo
                </label>
                <input
                  type="text"
                  disabled={!canManage}
                  value={formData.governo}
                  onChange={(e) => handleChange("governo", e.target.value)}
                  placeholder="Ex: GOVERNO DO ESTADO DO PARÁ"
                  className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Secretaria / Vinculação
                </label>
                <input
                  type="text"
                  disabled={!canManage}
                  value={formData.secretaria}
                  onChange={(e) => handleChange("secretaria", e.target.value)}
                  placeholder="Ex: SECRETARIA DE ESTADO DE SEGURANÇA PÚBLICA"
                  className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nome do Órgão Principal
                </label>
                <input
                  type="text"
                  disabled={!canManage}
                  value={formData.orgao}
                  onChange={(e) => handleChange("orgao", e.target.value)}
                  placeholder="Ex: DEPARTAMENTO DE TRÂNSITO DO ESTADO DO PARÁ"
                  className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Sigla Oficial
                </label>
                <input
                  type="text"
                  disabled={!canManage}
                  value={formData.sigla}
                  onChange={(e) => handleChange("sigla", e.target.value)}
                  placeholder="Ex: DETRAN/PA"
                  className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Cidade / Estado (UF)
                </label>
                <input
                  type="text"
                  disabled={!canManage}
                  value={formData.cidade_uf}
                  onChange={(e) => handleChange("cidade_uf", e.target.value)}
                  placeholder="Ex: Itaituba - PA"
                  className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Subtítulo Institucional (em Relatórios)
                </label>
                <input
                  type="text"
                  disabled={!canManage}
                  value={formData.subtitulo_relatorio}
                  onChange={(e) => handleChange("subtitulo_relatorio", e.target.value)}
                  placeholder="Ex: COORDENADORIA DE HABILITAÇÃO & PROTOCOLO GERAL DE CNHs"
                  className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                />
              </div>
            </div>

            {/* Seção 2: Unidades e Agências Padrão */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
              <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Agências e Unidades Padrão para Memorandos
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Unidade de Origem (Remetente)
                  </label>
                  <input
                    type="text"
                    disabled={!canManage}
                    value={formData.origem_padrao}
                    onChange={(e) => handleChange("origem_padrao", e.target.value)}
                    placeholder="Ex: DA AGÊNCIA DO DETRAN DE ITAITUBA-PA"
                    className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Unidade de Destino (Recebedor)
                  </label>
                  <input
                    type="text"
                    disabled={!canManage}
                    value={formData.destino_padrao}
                    onChange={(e) => handleChange("destino_padrao", e.target.value)}
                    placeholder="Ex: PARA AGÊNCIA DO DETRAN DE SANTARÉM-PA"
                    className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                  />
                </div>
              </div>
            </div>

            {/* Seção 3: Contatos e Endereço */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
              <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Contatos Institucionais & Endereço
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Telefone Institucional
                  </label>
                  <input
                    type="text"
                    disabled={!canManage}
                    value={formData.telefone}
                    onChange={(e) => handleChange("telefone", e.target.value)}
                    placeholder="Ex: (91) 3214-0000"
                    className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    E-mail do Setor / Protocolo
                  </label>
                  <input
                    type="email"
                    disabled={!canManage}
                    value={formData.email}
                    onChange={(e) => handleChange("email", e.target.value)}
                    placeholder="Ex: protocolo@detran.pa.gov.br"
                    className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Endereço Completo da Sede / CIRETRAN
                  </label>
                  <input
                    type="text"
                    disabled={!canManage}
                    value={formData.endereco}
                    onChange={(e) => handleChange("endereco", e.target.value)}
                    placeholder="Ex: Rodovia BR-316, Km 03 - Mangueirão, Belém / PA"
                    className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                  />
                </div>
              </div>
            </div>

            {/* Rodapé com Botão de Salvar e Aviso Visual de Sucesso */}
            {canManage && (
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="w-full sm:w-auto">
                  {isSaved && (
                    <div className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-200 dark:border-emerald-800/80 px-3.5 py-2 rounded-xl animate-in fade-in">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span>Dados do Órgão e Logomarca salvos com sucesso!</span>
                    </div>
                  )}
                  {errorMessage && (
                    <div className="inline-flex items-center gap-2 text-xs font-semibold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/70 border border-rose-200 dark:border-rose-800/80 px-3.5 py-2 rounded-xl animate-in fade-in">
                      <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                      <span>{errorMessage}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => handleSubmit()}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-xl shadow-md hover:shadow-lg transition-all cursor-pointer active:scale-95"
                  >
                    {isSaving ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Salvando Dados...</span>
                      </>
                    ) : isSaved ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                        <span>Salvo com Sucesso!</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        <span>Salvar Dados do Órgão</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </form>

      {/* Toast Flutuante de Sucesso (Fixo na parte inferior da tela) */}
      {showSuccessToast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md bg-emerald-600 text-white p-4 rounded-2xl shadow-2xl border border-emerald-500 flex items-center justify-between gap-4 animate-in slide-in-from-bottom-5 duration-300">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/20 rounded-xl shrink-0">
              <CheckCircle2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-white tracking-wide">
                Alterações Salvas com Sucesso!
              </h4>
              <p className="text-[11px] text-emerald-100 mt-0.5">
                Os dados institucionais, contatos e logomarca do DETRAN foram atualizados em todos os relatórios e PDFs.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowSuccessToast(false)}
            className="text-white/80 hover:text-white p-1.5 rounded-lg hover:bg-white/10 text-xs font-bold transition-all shrink-0 cursor-pointer"
            title="Fechar aviso"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
};
