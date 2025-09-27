import { useState } from 'react';
import { Upload, FileText, Download, AlertCircle, CheckCircle2 } from 'lucide-react';

const availableSections = [
  'Full Paper',
  'Abstract',
  'Introduction',
  'Methodology',
  'Results',
  'Discussion',
  'Conclusion',
];

function App() {
  const [files, setFiles] = useState<File[]>([]);
  const [pdfUrls, setPdfUrls] = useState<string[]>([]);
  const [extracted, setExtracted] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean[]>([]);
  const [error, setError] = useState<(string | null)[]>([]);
  const [fields, setFields] = useState<string[]>([]);
  const [fieldInput, setFieldInput] = useState<string>('');
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [llmModel, setLlmModel] = useState('gemini');
  const [userApiKey, setUserApiKey] = useState('');
  const [combinedCsv, setCombinedCsv] = useState<string>('');
  const [extracting, setExtracting] = useState(false);

  // NEW: Section selection state
  const [selectedSections, setSelectedSections] = useState<string[]>(['Full Paper']);

  // Section selection handler
  const handleSectionSelect = (section: string) => {
    if (section === 'Full Paper') {
      setSelectedSections(['Full Paper']);
    } else if (selectedSections.includes('Full Paper')) {
      setSelectedSections([section]);
    } else if (selectedSections.includes(section)) {
      const updated = selectedSections.filter(s => s !== section);
      setSelectedSections(updated.length === 0 ? ['Full Paper'] : updated);
    } else {
      setSelectedSections([...selectedSections, section]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []).filter(f => f.type === 'application/pdf');
    // Calculate total size in bytes
    const totalSize = selectedFiles.reduce((acc, file) => acc + file.size, 0);
    // const maxSize = 4 * 1024 * 1024; // 4MB in bytes
    // if (totalSize > maxSize) {
    //   setShowLimitModal(true);
    //   setFiles([]);
    //   setPdfUrls([]);
    //   setExtracted([]);
    //   setError(['Due to limited resources, we can\'t handle files above 4MB. Please upload up to 4MB of PDF files.']);
    //   return;
    // }
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
      // NEW: send selectedSections as stringified array
      formData.append('sections', JSON.stringify(selectedSections));
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
        // Set extracted and error per file
        setExtracted(data.results.map((r: any) => r.result || ''));
        setError(data.results.map((r: any) => r.error || null));
        setLoading(Array(files.length).fill(false));
      }
      if (data.combinedCsv) {
        setCombinedCsv(data.combinedCsv);
      }
    } catch (err) {
      // Set the same error for all files if the request itself failed
      setError(Array(files.length).fill(err instanceof Error ? err.message : 'Error extracting PDFs'));
      setLoading(Array(files.length).fill(false));
    } finally {
      setExtracting(false);
    }
  };

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
      // NEW: send selectedSections as stringified array
      formData.append('sections', JSON.stringify(selectedSections));

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
          // Simple local CSV combiner: just concatenate, or you can improve this logic
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

  return (
    <>
      {showLimitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center relative animate-fade-in">
            <h2 className="text-xl font-bold text-red-600 mb-4">Upload Limit Exceeded</h2>
            <p className="text-gray-700 mb-6">Due to limited resources, we can't handle files above <span className="font-semibold">4MB</span>.<br/>Please upload up to 4MB of PDF files.</p>
            <button
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-colors duration-200"
              onClick={() => setShowLimitModal(false)}
              autoFocus
            >
              Close
            </button>
          </div>
        </div>
      )}
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-24 h-24  mb-4 ">
          <img src="./logo.png" alt="Logo" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Forja de Matéria AI</h1>
          <p className="text-lg text-gray-600">Extract and analyze data from your PDF documents with ease</p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Upload & Preview Section */}
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

              {/* LLM Model Selector and API Key Input */}
              <div className="mt-6 flex flex-col gap-3">
                <label className="font-medium text-gray-700">
                  Choose LLM Model:
                  <select
                    value={llmModel}
                    onChange={e => setLlmModel(e.target.value)}
                    className="ml-2 px-2 py-1 rounded border border-gray-300"
                  >
                    <option value="gemini">Gemini</option>
                    <option value="openai">OpenAI</option>
                    <option value="grok">Grok</option>
                    <option value="deepseek">Deepseek</option>
                    <option value="claude">Claude</option>
                    <option value="kimi">KIMI</option>
                  </select>
                </label>
                <label className="font-medium text-gray-700">
                  API Key:
                  <input
                    type="password"
                    value={userApiKey}
                    onChange={e => setUserApiKey(e.target.value)}
                    placeholder="Enter your API key"
                    className="ml-2 px-2 py-1 rounded border border-gray-300 w-72"
                  />
                </label>
              </div>

              {/* NEW: Section selection UI */}
              <div className="mt-6">
                <div className="font-medium text-gray-700 mb-2">Target Sections for Extraction</div>
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
                <p className="text-xs text-gray-500 mt-1">
                  Select which sections of the paper to extract data from.
                </p>
              </div>

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

            {/* PDF Previews */}
            {pdfUrls.length > 0 && (
              <div className="bg-white/70 backdrop-blur-sm rounded-3xl p-8 shadow-xl border border-white/50">
                <h2 className="text-xl font-semibold text-gray-800 mb-6">Document Previews</h2>
                <div className="grid gap-6">
                  {pdfUrls.map((url, idx) => (
                    <div key={url} className="bg-white rounded-2xl p-4 shadow-inner">
                      <div className="font-semibold mb-2">{files[idx]?.name}</div>
                      <embed
                        src={url}
                        type="application/pdf"
                        width="100%"
                        height="300px"
                        className="rounded-xl"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
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
                          <div className="flex flex-wrap gap-1 mt-1">
                            {selectedSections.map(section => (
                              <span
                                key={section}
                                className="inline-block bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs font-medium"
                              >
                                {section}
                              </span>
                            ))}
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
