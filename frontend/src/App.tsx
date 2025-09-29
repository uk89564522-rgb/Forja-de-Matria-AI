import { useState } from 'react';
import { Upload, FileText, Download, CheckCircle2, Settings } from 'lucide-react';

const availableSections = [
  'Abstract', 'Introduction', 'Methodology', 'Results', 'Discussion', 'Conclusion'
];

type TargetingMethod = 'full' | 'sections' | 'semantic';

function App() {
  // Settings modal state
  const [showSettings, setShowSettings] = useState(false);
  const [llmModel, setLlmModel] = useState('gemini');
  const [userApiKey, setUserApiKey] = useState('');

  // File and extraction state
  const [files, setFiles] = useState<File[]>([]);
  const [pdfUrls, setPdfUrls] = useState<string[]>([]);
  const [extracted, setExtracted] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean[]>([]);
  const [error, setError] = useState<(string | null)[]>([]);
  const [fields, setFields] = useState<string[]>([]);
  const [fieldInput, setFieldInput] = useState<string>('');
  const [combinedCsv, setCombinedCsv] = useState<string>('');
  const [extracting, setExtracting] = useState(false);

  // Targeting method state
  const [targetingMethod, setTargetingMethod] = useState<TargetingMethod>('full');
  const [selectedSections, setSelectedSections] = useState<string[]>([]);
  const [semanticQuery, setSemanticQuery] = useState('');
  const [semanticResult, setSemanticResult] = useState<string | null>(null);
  const [semanticLoading, setSemanticLoading] = useState(false);

  // Section selection handler
  const handleSectionSelect = (section: string) => {
    if (selectedSections.includes(section)) {
      setSelectedSections(selectedSections.filter(s => s !== section));
    } else {
      setSelectedSections([...selectedSections, section]);
    }
  };

  // File change handler
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []).filter(f => f.type === 'application/pdf');
    if (selectedFiles.length > 0) {
      setFiles(selectedFiles);
      setPdfUrls(selectedFiles.map(f => URL.createObjectURL(f)));
      setExtracted(Array(selectedFiles.length).fill(''));
      setError(Array(selectedFiles.length).fill(null));
    } else {
      setFiles([]);
      setPdfUrls([]);
      setExtracted([]);
      setError(['Please select PDF files.']);
    }
  };

  // Extraction handler (append targeting info based on method)
  const handleExtractAll = async () => {
    if (!files.length) return;
    setExtracting(true);
    setError(Array(files.length).fill(null));
    setExtracted(Array(files.length).fill(''));
    setCombinedCsv('');
    setLoading(Array(files.length).fill(true));

    try {
      const formData = new FormData();
      files.forEach(file => formData.append('files', file));
      formData.append('fields', fields.join(','));
      formData.append('llmModel', llmModel);
      formData.append('apiKey', userApiKey);

      // Targeting method logic
      if (targetingMethod === 'full') {
        formData.append('sections', JSON.stringify(['Full Paper']));
      } else if (targetingMethod === 'sections') {
        formData.append('sections', JSON.stringify(selectedSections));
      } else if (targetingMethod === 'semantic') {
        formData.append('sections', JSON.stringify([semanticResult || semanticQuery]));
      }

      const res = await fetch('http://localhost:5000/extract-multi-file-data', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const errData = await res.json();
        setError(Array(files.length).fill(errData.error || 'Failed to extract PDFs'));
        setLoading(Array(files.length).fill(false));
        setExtracting(false);
        return;
      }
      const data = await res.json();
      if (data.results) {
        setExtracted(data.results.map((r: any) => r.result || ''));
        setError(data.results.map((r: any) => r.error || null));
        setLoading(Array(files.length).fill(false));
      }
      if (data.combinedCsv) {
        setCombinedCsv(data.combinedCsv);
      }
    } catch (err) {
      setError(Array(files.length).fill(err instanceof Error ? err.message : 'Error extracting PDFs'));
      setLoading(Array(files.length).fill(false));
    } finally {
      setExtracting(false);
    }
  };

  // Retry handler for a single file
  const handleRetry = async (fileIdx: number) => {
    setLoading(l => {
      const arr = [...l];
      arr[fileIdx] = true;
      return arr;
    });
    setError(e => {
      const arr = [...e];
      arr[fileIdx] = null;
      return arr;
    });

    try {
      const formData = new FormData();
      formData.append('files', files[fileIdx]);
      formData.append('fields', fields.join(','));
      formData.append('llmModel', llmModel);
      formData.append('apiKey', userApiKey);

      // Targeting method logic
      if (targetingMethod === 'full') {
        formData.append('sections', JSON.stringify(['Full Paper']));
      } else if (targetingMethod === 'sections') {
        formData.append('sections', JSON.stringify(selectedSections));
      } else if (targetingMethod === 'semantic') {
        formData.append('sections', JSON.stringify([semanticResult || semanticQuery]));
      }

      const res = await fetch('http://localhost:5000/extract-multi-file-data', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) throw new Error('Failed to extract PDF');
      const data = await res.json();
      if (data.results && data.results[0]) {
        setExtracted(prev => {
          const arr = [...prev];
          arr[fileIdx] = data.results[0].result || '';
          // After updating the extracted array, regenerate combined CSV locally:
          const csvsWithFilenames = files
            .map((file, idx) =>
              arr[idx]
                ? `Filename: ${file.name}\n${(arr[idx].split("```")[1] || arr[idx]).trim()}`
                : null
            )
            .filter(Boolean)
            .join('\n\n');
          setCombinedCsv(csvsWithFilenames);
          return arr;
        });
        setError(prev => {
          const arr = [...prev];
          arr[fileIdx] = data.results[0].error || null;
          return arr;
        });
      }
    } catch (err) {
      setError(prev => {
        const arr = [...prev];
        arr[fileIdx] = err instanceof Error ? err.message : 'Error extracting PDF';
        return arr;
      });
    } finally {
      setLoading(l => {
        const arr = [...l];
        arr[fileIdx] = false;
        return arr;
      });
    }
  };

  // Semantic search handler
  const handleSemanticSearch = async () => {
    if (!semanticQuery.trim() || files.length === 0) return;
    setSemanticLoading(true);
    setSemanticResult(null);
    const formData = new FormData();
    formData.append('file', files[0]);
    formData.append('query', semanticQuery);
    const res = await fetch('http://localhost:5000/semantic-section-search', {
      method: 'POST',
      body: formData,
    });
    if (res.ok) {
      const data = await res.json();
      setSemanticResult(data.section || 'No relevant section found.');
    } else {
      setSemanticResult('No relevant section found.');
    }
    setSemanticLoading(false);
  };

  return (
    <>
      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center relative animate-fade-in">
            <h2 className="text-xl font-bold text-blue-700 mb-4">Settings</h2>
            <div className="mb-4">
              <label className="block font-medium mb-1 text-gray-700">LLM Model</label>
              <select
                value={llmModel}
                onChange={e => setLlmModel(e.target.value)}
                className="w-full px-2 py-1 rounded border border-gray-300"
              >
                <option value="gemini">Gemini</option>
                <option value="openai">OpenAI</option>
                <option value="grok">Grok</option>
                <option value="deepseek">Deepseek</option>
                <option value="claude">Claude</option>
                <option value="kimi">KIMI</option>
              </select>
            </div>
            <div className="mb-6">
              <label className="block font-medium mb-1 text-gray-700">API Key</label>
              <input
                type="password"
                value={userApiKey}
                onChange={e => setUserApiKey(e.target.value)}
                placeholder="Enter your API key"
                className="w-full px-2 py-1 rounded border border-gray-300"
              />
            </div>
            <button
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-colors duration-200"
              onClick={() => setShowSettings(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}

      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
        <div className="container mx-auto px-4 py-8 max-w-6xl">
          {/* Header with settings icon */}
          <div className="flex justify-between items-center mb-8">
            <div className="inline-flex items-center gap-3">
              <div className="w-16 h-16">
                <img src="./logo.png" alt="Logo" />
              </div>
              <h1 className="text-3xl font-bold text-gray-900">Forja de Matéria AI</h1>
            </div>
            <button
              className="p-2 rounded-full hover:bg-blue-100"
              onClick={() => setShowSettings(true)}
              aria-label="Settings"
            >
              <Settings size={28} className="text-blue-700" />
            </button>
          </div>

          <div className="grid lg:grid-cols-2 gap-8">
            {/* Upload & Control Panel */}
            <div className="space-y-6">
              {/* Upload Card */}
              <div className="bg-white/70 backdrop-blur-sm rounded-3xl p-8 shadow-xl border border-white/50">
                <h2 className="text-xl font-semibold text-gray-800 mb-6 flex items-center gap-3">
                  <Upload size={24} className="text-blue-600" />
                  Upload Document
                </h2>
                <div className="relative">
                  <input
                    type="file"
                    accept="application/pdf"
                    multiple
                    onChange={handleFileChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    id="pdf-upload"
                  />
                  <label
                    htmlFor="pdf-upload"
                    className={`
                      flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-2xl
                      transition-all duration-200 cursor-pointer
                      ${files.length > 0
                        ? 'border-green-300 bg-green-50'
                        : 'border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-blue-50'
                      }
                    `}
                  >
                    {files.length > 0 ? (
                      <>
                        <CheckCircle2 size={48} className="text-green-600 mb-4" />
                        <p className="text-lg font-medium text-green-700 mb-2">{files.length} PDF{files.length > 1 ? 's' : ''} selected</p>
                        <ul className="text-sm text-green-600 mb-2">
                          {files.map(f => <li key={f.name}>{f.name}</li>)}
                        </ul>
                        <p className="text-sm text-green-600">Ready for extraction</p>
                      </>
                    ) : (
                      <>
                        <Upload size={48} className="text-gray-400 mb-4" />
                        <p className="text-lg font-medium text-gray-700 mb-2">Drop your PDFs here</p>
                        <p className="text-sm text-gray-500">or click to browse</p>
                      </>
                    )}
                  </label>
                </div>

                {/* Input for specifying fields/data points */}
                <div className="mt-6">
                  <label htmlFor="fields-input" className="block text-gray-700 font-medium mb-2">
                    Specify the exact data columns or fields to extract
                  </label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {fields.map((field, idx) => (
                      <span
                        key={field + idx}
                        className="inline-flex items-center px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium mr-2 mb-2"
                      >
                        {field}
                        <button
                          type="button"
                          className="ml-2 text-blue-500 hover:text-red-500 focus:outline-none"
                          onClick={() => setFields(fields.filter((_, i) => i !== idx))}
                          aria-label={`Remove ${field}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      id="fields-input"
                      type="text"
                      value={fieldInput}
                      onChange={e => setFieldInput(e.target.value)}
                      onKeyDown={e => {
                        if ((e.key === 'Enter' || e.key === ',') && fieldInput.trim()) {
                          e.preventDefault();
                          if (!fields.includes(fieldInput.trim())) {
                            setFields([...fields, fieldInput.trim()]);
                          }
                          setFieldInput('');
                        }
                      }}
                      placeholder="Type a field and press Enter or Comma"
                      className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-gray-800 bg-white"
                    />
                    <button
                      type="button"
                      className="px-4 py-2 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700"
                      onClick={() => {
                        if (fieldInput.trim() && !fields.includes(fieldInput.trim())) {
                          setFields([...fields, fieldInput.trim()]);
                          setFieldInput('');
                        }
                      }}
                    >
                      Add
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Press Enter or Comma to add multiple fields.</p>
                </div>

                {/* Targeting Method Dropdown */}
                <div className="mt-6">
                  <label className="font-medium text-gray-700 mb-2 block">Targeting Method</label>
                  <select
                    value={targetingMethod}
                    onChange={e => setTargetingMethod(e.target.value as TargetingMethod)}
                    className="w-full px-3 py-2 rounded border border-gray-300"
                  >
                    <option value="full">Full Paper</option>
                    <option value="sections">Select from Sections</option>
                    <option value="semantic">Describe a Section</option>
                  </select>
                </div>

                {/* Progressive Disclosure: Show only relevant targeting UI */}
                {targetingMethod === 'sections' && (
                  <div className="mt-4">
                    <div className="font-medium text-gray-700 mb-2">Select Sections</div>
                    <div className="flex flex-wrap gap-2">
                      {availableSections.map(section => (
                        <button
                          type="button"
                          key={section}
                          onClick={() => handleSectionSelect(section)}
                          className={`px-3 py-1 rounded-lg font-medium border transition-colors duration-150
                            ${selectedSections.includes(section)
                              ? 'bg-blue-600 text-white border-blue-700'
                              : 'bg-gray-200 text-gray-700 border-gray-300 hover:bg-blue-100'
                            }
                          `}
                        >
                          {section}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {targetingMethod === 'semantic' && (
                  <div className="mt-4">
                    <label className="font-medium text-gray-700 mb-2 block">Describe the Section</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={semanticQuery}
                        onChange={e => setSemanticQuery(e.target.value)}
                        placeholder="Describe the section you want (e.g. catalyst degradation)"
                        className="px-3 py-2 rounded border border-gray-300 w-full"
                      />
                      <button
                        type="button"
                        onClick={handleSemanticSearch}
                        className="px-4 py-2 bg-blue-600 text-white rounded font-medium"
                        disabled={semanticLoading || !semanticQuery.trim() || files.length === 0}
                      >
                        {semanticLoading ? 'Searching...' : 'Find Section'}
                      </button>
                    </div>
                    {semanticResult && (
                      <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-sm text-blue-900">
                        <div className="font-semibold mb-1">Best Match:</div>
                        <div>{semanticResult}</div>
                      </div>
                    )}
                  </div>
                )}

                {files.length > 0 && (
                  <div className="mt-6">
                    <button
                      onClick={handleExtractAll}
                      disabled={extracting}
                      className={`w-full px-6 py-4 rounded-2xl font-semibold text-white transition-all duration-200 transform
                        ${extracting
                          ? 'bg-gray-300 cursor-not-allowed'
                          : 'bg-blue-600 hover:bg-blue-700 hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-xl'
                        }`}
                    >
                      {extracting ? (
                        <div className="flex items-center justify-center gap-3">
                          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                          Extracting All PDFs...
                        </div>
                      ) : (
                        'Extract Data from All PDFs'
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Results Section */}
            <div>
              <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100 h-full">
                <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-3 mb-6">
                  <FileText size={24} className="text-blue-600" />
                  Extracted Data
                </h2>
                {/* Combined CSV Download */}
                {combinedCsv && (
                  <div className="mb-6">
                    <button
                      onClick={() => {
                        const blob = new Blob([combinedCsv], { type: 'text/csv' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = 'combined-extracted.csv';
                        document.body.appendChild(a);
                        a.click();
                        setTimeout(() => {
                          document.body.removeChild(a);
                          URL.revokeObjectURL(url);
                        }, 0);
                      }}
                      className="px-4 py-2 bg-green-700 hover:bg-green-800 text-white rounded-lg text-sm font-medium transition-colors duration-200 flex items-center gap-2 shadow-sm"
                    >
                      <Download size={16} />
                      Download Combined CSV
                    </button>
                    <pre className="mt-4 text-xs text-gray-800 whitespace-pre-wrap font-mono leading-relaxed max-h-[300px] overflow-y-auto bg-white rounded p-2 border">
                      {combinedCsv}
                    </pre>
                  </div>
                )}
                {files.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                      <FileText size={24} className="text-gray-400" />
                    </div>
                    <h3 className="text-lg font-medium text-gray-700 mb-2">No data extracted yet</h3>
                    <p className="text-gray-500 max-w-sm">Upload PDF files and click extract to see the results here</p>
                  </div>
                ) : (
                  <div className="grid gap-6">
                    {files.map((f, idx) => (
                      <div key={f.name} className="border border-gray-200 rounded-xl p-4 bg-gray-50">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <div className="font-semibold text-gray-800">{f.name}</div>
                            {/* Show selected sections/semantic query as badges */}
                            <div className="flex flex-wrap gap-1 mt-1">
                              {targetingMethod === 'full' && (
                                <span className="inline-block bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs font-medium">
                                  Full Paper
                                </span>
                              )}
                              {targetingMethod === 'sections' && selectedSections.map(section => (
                                <span
                                  key={section}
                                  className="inline-block bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs font-medium"
                                >
                                  {section}
                                </span>
                              ))}
                              {targetingMethod === 'semantic' && (
                                <span className="inline-block bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs font-medium">
                                  {semanticResult || semanticQuery}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            {loading[idx] && (
                              <div className="flex items-center gap-2 text-blue-600 text-xs">
                                <div className="w-4 h-4 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                                Extracting...
                              </div>
                            )}
                            {extracted[idx] && !loading[idx] && (
                              <button
                                onClick={() => {
                                  const csv = (extracted[idx].split("```")[1] || extracted[idx]).trim();
                                  const blob = new Blob([csv], { type: 'text/csv' });
                                  const url = URL.createObjectURL(blob);
                                  const a = document.createElement('a');
                                  a.href = url;
                                  a.download = f.name.replace(/\.pdf$/i, '') + '-extracted.csv';
                                  document.body.appendChild(a);
                                  a.click();
                                  setTimeout(() => {
                                    document.body.removeChild(a);
                                    URL.revokeObjectURL(url);
                                  }, 0);
                                }}
                                className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-medium transition-colors duration-200 flex items-center gap-2 shadow-sm"
                              >
                                <Download size={14} />
                                Download CSV
                              </button>
                            )}
                            {error[idx] && (
                              <button
                                onClick={() => handleRetry(idx)}
                                className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-medium transition-colors duration-200 flex items-center gap-2 shadow-sm"
                              >
                                Retry
                              </button>
                            )}
                          </div>
                        </div>
                        {extracted[idx] && !loading[idx] && (
                          <pre className="text-xs text-gray-800 whitespace-pre-wrap font-mono leading-relaxed max-h-[300px] overflow-y-auto bg-white rounded p-2 border">
                            {(extracted[idx].split("```")[1] || extracted[idx]).trim()}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default App;
