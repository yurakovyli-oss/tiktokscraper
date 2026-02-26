"use client";

import { useState, useEffect } from "react";

export default function Home() {
  const [searchType, setSearchType] = useState('keyword');
  const [query, setQuery] = useState('');
  const [maxItems, setMaxItems] = useState(10);
  const [minViews, setMinViews] = useState('');
  const [minEr, setMinEr] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [history, setHistory] = useState([]);
  const [savedVideos, setSavedVideos] = useState([]);
  const [sidebarTab, setSidebarTab] = useState('history'); // 'history' | 'saved'
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  // Transcription state
  const [transcriptions, setTranscriptions] = useState({}); // { [videoId]: { text: string, error: string } }
  const [transcribingIds, setTranscribingIds] = useState(new Set());
  const [copiedId, setCopiedId] = useState(null);
  const [hiddenTranscripts, setHiddenTranscripts] = useState(new Set());

  // API Balances state
  const [apiBalances, setApiBalances] = useState({ apify: null, groq: null });

  // Apify API Keys state
  const [apifyKeys, setApifyKeys] = useState([]);
  const [selectedKeyId, setSelectedKeyId] = useState('');

  // Modal state
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [modalTab, setModalTab] = useState('transcript');

  // AI Analysis state
  const [aiResults, setAiResults] = useState({}); // { [videoId]: { summary, ideas, hook } }
  const [aiLoadingTab, setAiLoadingTab] = useState(null);

  // Full video analysis state (Анализ tab)
  const [videoAnalysis, setVideoAnalysis] = useState({}); // { [videoId]: { summary, structure, hookPhrase, visualHook, loading, error } }
  const [analysisStep, setAnalysisStep] = useState(''); // '' | 'transcribing' | 'analyzing'

  // Formatting helper for views/likes (converts 1300000 to "1,3 млн")
  const formatMetric = (num) => {
    if (!num) return '0';
    if (num >= 1000000) return (num / 1000000).toFixed(1).replace('.', ',') + ' млн';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
    return num.toString();
  };

  // Load history and saved videos on mount
  useEffect(() => {
    try {
      const savedHistory = localStorage.getItem('tiktok_scraper_history');
      if (savedHistory) {
        try {
          const parsed = JSON.parse(savedHistory);
          if (Array.isArray(parsed)) setHistory(parsed);
        } catch (e) { }
      }

      const savedVids = localStorage.getItem('tiktok_scraper_saved');
      if (savedVids) {
        try {
          const parsed = JSON.parse(savedVids);
          if (Array.isArray(parsed)) setSavedVideos(parsed);
        } catch (e) { }
      }
    } catch (e) {
      console.error('Failed to load from storage', e);
    }

    // Fetch API Keys
    const fetchKeys = async () => {
      try {
        const res = await fetch('/api/apify-keys');
        if (res.ok) {
          const data = await res.json();
          setApifyKeys(Array.isArray(data.keys) ? data.keys : []);
          const savedKeyId = localStorage.getItem('tiktok_scraper_key_id');
          if (savedKeyId && data.keys?.find(k => k.id === savedKeyId)) {
            setSelectedKeyId(savedKeyId);
          } else if (data.keys?.[0]) {
            setSelectedKeyId(data.keys[0].id);
          }
        }
      } catch (err) {
        console.error('Failed to fetch api keys', err);
      }
    };
    fetchKeys();
    setIsMounted(true);
  }, []);

  // Fetch API Balances when selected key changes
  useEffect(() => {
    const fetchBalances = async () => {
      // Show loading state for Apify balance when switching
      setApiBalances(prev => ({ ...prev, apify: null }));
      try {
        const url = selectedKeyId ? `/api/balance?keyId=${selectedKeyId}` : '/api/balance';
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          setApiBalances(data);
        }
      } catch (err) {
        console.error('Failed to fetch api balances', err);
      }
    };

    // Only fetch if we have established a selected key (or know there isn't one yet but keys are loaded)
    if (selectedKeyId || apifyKeys.length > 0) {
      fetchBalances();
    }
  }, [selectedKeyId, apifyKeys.length]);



  // Save history helper
  const saveToHistory = (newResults, currentSearchType, currentQuery, currentMax, currentMinViews) => {
    const newItem = {
      id: Date.now(),
      date: new Date().toLocaleDateString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
      type: currentSearchType,
      query: currentQuery,
      maxItems: currentMax,
      minViews: currentMinViews,
      minEr: minEr,
      dateFrom: dateFrom,
      dateTo: dateTo,
      results: newResults
    };

    setHistory(prev => {
      const updated = [newItem, ...prev].slice(0, 50); // Keep last 50 searches
      try {
        localStorage.setItem('tiktok_scraper_history', JSON.stringify(updated));
      } catch (err) {
        console.warn('Cannot save history to localStorage (quota exceeded or disabled).', err);
      }
      return updated;
    });
  };

  const loadFromHistory = (historyItem) => {
    setSearchType(historyItem.type);
    setQuery(historyItem.query);
    setMaxItems(historyItem.maxItems);
    setMinViews(historyItem.minViews || '');
    setMinEr(historyItem.minEr || '');
    setDateFrom(historyItem.dateFrom || '');
    setDateTo(historyItem.dateTo || '');
    setResults(historyItem.results);
    setHasSearched(true);
    setError(null);
    // Scroll to top or results area if needed
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem('tiktok_scraper_history');
  };

  const toggleSaveVideo = (video) => {
    setSavedVideos(prev => {
      const isSaved = prev.some(v => v.id === video.id);
      let updated;
      if (isSaved) {
        updated = prev.filter(v => v.id !== video.id);
      } else {
        updated = [video, ...prev]; // Add to beginning
      }
      try {
        localStorage.setItem('tiktok_scraper_saved', JSON.stringify(updated));
      } catch (err) {
        console.warn('Cannot save video to localStorage (quota exceeded).', err);
      }
      return updated;
    });
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setHasSearched(true);
    setResults([]);

    try {
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: searchType, query, maxItems: Number(maxItems) || 10, keyId: selectedKeyId })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch results');
      }

      const items = data.data || [];

      // Store raw, unfiltered items in state and history. Formatting/filtering happens on the fly.
      setResults(items);
      saveToHistory(items, searchType, query, maxItems, minViews);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshStats = async () => {
    if (results.length === 0) return;

    setLoading(true);
    setError(null);
    try {
      // Extract URLs to scrape
      const urlsToScrape = results.map(r => r.webVideoUrl).filter(Boolean);

      if (urlsToScrape.length === 0) {
        throw new Error('Нет доступных ссылок для обновления метрик.');
      }

      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'url', query: urlsToScrape, maxItems: urlsToScrape.length, keyId: selectedKeyId })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to refresh stats');
      }

      const freshItems = data.data || [];

      // Update results with fresh data, maintaining order
      const freshItemsMap = new Map();
      freshItems.forEach(item => {
        if (item.id) freshItemsMap.set(item.id, item);
      });

      const updatedResults = results.map(oldItem => freshItemsMap.get(oldItem.id) || oldItem);

      setResults(updatedResults);

      // Also update this specific history item in localStorage so it persists
      setHistory(prev => {
        const hIndex = prev.findIndex(h => h.query === query && h.type === searchType);
        if (hIndex !== -1) {
          const updatedHistory = [...prev];
          updatedHistory[hIndex] = { ...updatedHistory[hIndex], results: updatedResults };
          try {
            localStorage.setItem('tiktok_scraper_history', JSON.stringify(updatedHistory));
          } catch (err) {
            console.warn('Cannot update history in localStorage.', err);
          }
          return updatedHistory;
        }
        return prev;
      });

    } catch (err) {
      setError(`Ошибка обновления метрик: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleTranscribe = async (item) => {
    const videoId = item.id;
    const mediaUrl = item.videoMeta?.downloadAddr || item.videoMeta?.playAddr || item.videoUrl || item.video?.playAddr || item.video?.downloadAddr || item.musicMeta?.playUrl;

    if (!mediaUrl) {
      setTranscriptions(prev => ({ ...prev, [videoId]: { error: 'У этого видео нет доступной ссылки для скачивания аудио/видео.' } }));
      return;
    }

    setTranscribingIds(prev => {
      const next = new Set(prev);
      next.add(videoId);
      return next;
    });

    // Clear any previous error/text while loading
    setTranscriptions(prev => ({ ...prev, [videoId]: { text: null, error: null } }));

    try {
      const res = await fetch('/api/transcribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ videoUrl: mediaUrl }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Ошибка при транскрибации');
      }

      setTranscriptions(prev => ({ ...prev, [videoId]: { text: data.text, segments: data.segments || [], language: data.language || null, error: null } }));
    } catch (err) {
      setTranscriptions(prev => ({ ...prev, [videoId]: { text: null, error: err.message } }));
    } finally {
      setTranscribingIds(prev => {
        const next = new Set(prev);
        next.delete(videoId);
        return next;
      });
    }
  };

  // AI Analysis handler
  const handleAiAnalyze = async (type) => {
    if (!selectedVideo || aiLoadingTab) return;
    const videoId = selectedVideo.id;
    setAiLoadingTab(type);
    try {
      const er = selectedVideo.playCount > 0
        ? (((selectedVideo.diggCount || 0) + (selectedVideo.commentCount || 0) + (selectedVideo.shareCount || 0) + (selectedVideo.collectCount || 0)) / selectedVideo.playCount * 100).toFixed(2)
        : '0';

      const res = await fetch('/api/ai-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          videoText: selectedVideo.text || '',
          transcript: transcriptions[videoId]?.text || '',
          metrics: {
            plays: selectedVideo.playCount || 0,
            likes: selectedVideo.diggCount || 0,
            er,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка AI');

      setAiResults(prev => ({
        ...prev,
        [videoId]: { ...(prev[videoId] || {}), [type]: data.result },
      }));
    } catch (err) {
      setAiResults(prev => ({
        ...prev,
        [videoId]: { ...(prev[videoId] || {}), [`${type}_error`]: err.message },
      }));
    } finally {
      setAiLoadingTab(null);
    }
  };

  // Full video analysis: transcribe + AI structure in one click
  const handleFullAnalysis = async () => {
    if (!selectedVideo) return;
    const videoId = selectedVideo.id;
    if (videoAnalysis[videoId]?.loading) return;

    setVideoAnalysis(prev => ({ ...prev, [videoId]: { loading: true, error: null } }));

    try {
      // Step 1: transcribe if not already done
      let transcriptText = transcriptions[videoId]?.text;
      let segments = transcriptions[videoId]?.segments || [];

      if (!transcriptText) {
        setAnalysisStep('transcribing');
        const mediaUrl = selectedVideo.videoMeta?.downloadAddr || selectedVideo.videoMeta?.playAddr
          || selectedVideo.videoUrl || selectedVideo.video?.playAddr || selectedVideo.video?.downloadAddr
          || selectedVideo.playAddr;

        if (!mediaUrl) throw new Error('URL видео недоступен для транскрибации');

        const transcribeRes = await fetch('/api/transcribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoUrl: mediaUrl }),
        });
        const transcribeData = await transcribeRes.json();
        if (!transcribeRes.ok) throw new Error(transcribeData.error || 'Ошибка транскрибации');

        transcriptText = transcribeData.text;
        segments = transcribeData.segments || [];
        setTranscriptions(prev => ({
          ...prev,
          [videoId]: { text: transcriptText, segments, language: transcribeData.language || null, error: null }
        }));
      }

      // Step 2: AI structure analysis
      setAnalysisStep('analyzing');
      const er = selectedVideo.playCount > 0
        ? (((selectedVideo.diggCount || 0) + (selectedVideo.commentCount || 0) + (selectedVideo.shareCount || 0) + (selectedVideo.collectCount || 0)) / selectedVideo.playCount * 100).toFixed(2)
        : '0';

      const analyzeRes = await fetch('/api/ai-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'structure',
          videoText: selectedVideo.text || '',
          transcript: transcriptText,
          segments,
          metrics: { plays: selectedVideo.playCount || 0, likes: selectedVideo.diggCount || 0, er },
        }),
      });
      const analyzeData = await analyzeRes.json();
      if (!analyzeRes.ok) throw new Error(analyzeData.error || 'Ошибка AI анализа');

      // Parse JSON from AI result (AI may wrap in markdown fences)
      let analysis;
      try {
        const jsonMatch = analyzeData.result.match(/\{[\s\S]*\}/);
        analysis = JSON.parse(jsonMatch ? jsonMatch[0] : analyzeData.result);
      } catch {
        analysis = { summary: analyzeData.result, structure: [], hookPhrase: null, visualHook: null };
      }

      setVideoAnalysis(prev => ({ ...prev, [videoId]: { ...analysis, loading: false, error: null } }));
    } catch (err) {
      setVideoAnalysis(prev => ({ ...prev, [videoId]: { loading: false, error: err.message } }));
    } finally {
      setAnalysisStep('');
    }
  };

  // Live filter helper for frontend rendering
  const getFilteredResults = (itemsToFilter = []) => {
    if (!itemsToFilter || !Array.isArray(itemsToFilter)) return [];

    return itemsToFilter.filter(item => {
      // 1. Min Views Filter
      if (minViews) {
        const v = Number(minViews);
        if (!isNaN(v) && (item.playCount || 0) < v) return false;
      }

      // 2. ER% Filter
      if (minEr) {
        const erTarget = Number(minEr);
        if (!isNaN(erTarget)) {
          const plays = item.playCount || 0;
          const er = plays > 0 ? (((item.diggCount || 0) + (item.commentCount || 0) + (item.shareCount || 0) + (item.collectCount || 0)) / plays * 100) : 0;
          if (er < erTarget) return false;
        }
      }

      // 3. Date Filters
      if (dateFrom || dateTo) {
        const createTime = item.createTime || (item.videoMeta && item.videoMeta.createTime) || (item.video && item.video.createTime);
        if (createTime) {
          const timeStr = String(createTime);
          const timeNum = timeStr.length === 10 ? parseInt(timeStr) : parseInt(timeStr) / 1000;

          if (dateFrom) {
            const fromSec = Math.floor(new Date(dateFrom).getTime() / 1000);
            if (timeNum < fromSec) return false;
          }
          if (dateTo) {
            const toDateObj = new Date(dateTo);
            toDateObj.setDate(toDateObj.getDate() + 1);
            const toSec = Math.floor(toDateObj.getTime() / 1000) - 1;
            if (timeNum > toSec) return false;
          }
        }
      }

      return true;
    });
  };

  if (!isMounted) return null;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', flexDirection: 'column' }}>

      {/* Fixed Hamburger Menu Button */}
      <button
        onClick={() => setIsSidebarOpen(true)}
        style={{
          position: 'fixed',
          top: '1.5rem',
          left: '1.5rem',
          zIndex: 50,
          background: 'rgba(255, 255, 255, 0.85)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid rgba(226, 232, 240, 0.8)',
          boxShadow: '0 4px 14px rgba(0, 0, 0, 0.08)',
          color: '#334155',
          cursor: 'pointer',
          width: '52px',
          height: '52px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '50%',
          transition: 'all 0.2s',
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.transform = 'scale(1.05)';
          e.currentTarget.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.12)';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.boxShadow = '0 4px 14px rgba(0, 0, 0, 0.08)';
        }}
        title="Открыть меню"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="12" x2="21" y2="12"></line>
          <line x1="3" y1="6" x2="21" y2="6"></line>
          <line x1="3" y1="18" x2="21" y2="18"></line>
        </svg>
      </button>

      {/* Overlay background when sidebar is open */}
      {isSidebarOpen && (
        <div
          onClick={() => setIsSidebarOpen(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(0,0,0,0.4)',
            backdropFilter: 'blur(2px)',
            zIndex: 9998,
            animation: 'fade-in 0.2s ease-out'
          }}
        />
      )}

      {/* Slide-out Sidebar */}
      <aside style={{
        position: 'fixed',
        top: 0,
        left: isSidebarOpen ? '0' : '-320px',
        width: '320px',
        background: 'var(--background)',
        borderRight: '1px solid var(--input-border)',
        padding: '2rem 1.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
        height: '100vh',
        zIndex: 9999,
        transition: 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        boxShadow: isSidebarOpen ? '4px 0 24px rgba(0,0,0,0.2)' : 'none',
        overflowY: 'auto'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '1rem', borderBottom: '2px solid var(--input-border)', width: '100%' }}>
            <button
              onClick={() => setSidebarTab('history')}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: '0.5rem 0',
                fontSize: '1.1rem', fontWeight: sidebarTab === 'history' ? 'bold' : 'normal',
                color: sidebarTab === 'history' ? 'var(--foreground)' : 'var(--foreground)',
                opacity: sidebarTab === 'history' ? 1 : 0.5,
                borderBottom: sidebarTab === 'history' ? '2px solid var(--primary)' : 'none',
                marginBottom: '-2px'
              }}
            >
              История
            </button>
            <button
              onClick={() => setSidebarTab('saved')}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: '0.5rem 0',
                fontSize: '1.1rem', fontWeight: sidebarTab === 'saved' ? 'bold' : 'normal',
                color: sidebarTab === 'saved' ? 'var(--foreground)' : 'var(--foreground)',
                opacity: sidebarTab === 'saved' ? 1 : 0.5,
                borderBottom: sidebarTab === 'saved' ? '2px solid var(--primary)' : 'none',
                marginBottom: '-2px'
              }}
            >
              Сохраненные
            </button>
          </div>

          <button
            onClick={() => setIsSidebarOpen(false)}
            style={{ background: 'none', border: 'none', color: 'var(--foreground)', cursor: 'pointer', fontSize: '1.4rem', padding: '0 0.2rem', marginLeft: '1rem' }}
          >
            ×
          </button>
        </div>

        {sidebarTab === 'history' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '-0.5rem' }}>
              {history.length > 0 && (
                <button
                  onClick={clearHistory}
                  style={{ background: 'none', border: 'none', color: 'var(--error)', cursor: 'pointer', fontSize: '0.9rem', opacity: 0.8 }}
                >
                  Очистить историю
                </button>
              )}
            </div>
            {(!history || history.length === 0) ? (
              <p style={{ opacity: 0.5, fontSize: '0.9rem', textAlign: 'center', marginTop: '2rem' }}>История пуста</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {history.map(item => (
                  <div
                    key={item.id}
                    onClick={() => {
                      loadFromHistory(item);
                      setIsSidebarOpen(false);
                    }}
                    style={{
                      padding: '1rem', background: 'var(--background)', borderRadius: 'var(--border-radius-lg)',
                      border: '1px solid var(--input-border)', cursor: 'pointer', transition: 'all 0.2s', position: 'relative',
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.borderColor = 'var(--primary)';
                      const delBtn = e.currentTarget.querySelector('.del-btn');
                      if (delBtn) delBtn.style.opacity = '1';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.borderColor = 'var(--input-border)';
                      const delBtn = e.currentTarget.querySelector('.del-btn');
                      if (delBtn) delBtn.style.opacity = '0';
                    }}
                  >
                    <button
                      className="del-btn"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        // Delete logic
                        const updatedHistory = history.filter(h => h.id !== item.id);
                        setHistory(updatedHistory);
                        try {
                          localStorage.setItem('tiktok_scraper_history', JSON.stringify(updatedHistory));
                        } catch (err) { }
                      }}
                      style={{
                        position: 'absolute', top: '0.5rem', right: '0.5rem', background: '#ffe4e6', color: '#e11d48',
                        border: 'none', width: '24px', height: '24px', borderRadius: '50%', display: 'flex',
                        alignItems: 'center', justifyContent: 'center', cursor: 'pointer', opacity: 0, transition: 'opacity 0.2s',
                        zIndex: 10
                      }}
                      title="Удалить"
                    >
                      ×
                    </button>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.8rem', opacity: 0.6 }}>
                      <span>{item.date}</span>
                      <span style={{ marginRight: '1.5rem' }}>{item.results?.length || 0} видео</span>
                    </div>
                    <div style={{ fontWeight: '600', marginBottom: '0.25rem' }}>
                      {item.type === 'tag' ? '#' : ''}{item.query}
                    </div>
                    <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>
                      Лимит: {item.maxItems} {item.minViews ? `| От ${item.minViews} пр.` : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {sidebarTab === 'saved' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '-0.5rem' }}>
              <span style={{ fontSize: '0.9rem', opacity: 0.7 }}>Всего: {savedVideos.length}</span>
              {savedVideos.length > 0 && (
                <button
                  onClick={() => {
                    setResults(savedVideos);
                    setHasSearched(true);
                    setIsSidebarOpen(false);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  style={{ background: 'var(--primary)', border: 'none', color: 'white', cursor: 'pointer', fontSize: '0.8rem', padding: '0.4rem 0.8rem', borderRadius: 'var(--border-radius-md)' }}
                >
                  Показать все
                </button>
              )}
            </div>

            {(!savedVideos || savedVideos.length === 0) ? (
              <p style={{ opacity: 0.5, fontSize: '0.9rem', textAlign: 'center', marginTop: '2rem' }}>Нет сохраненных видео</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                {savedVideos.map(item => (
                  <div
                    key={item.id}
                    onClick={() => {
                      setResults([item]);
                      setHasSearched(true);
                      setIsSidebarOpen(false);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    style={{
                      padding: '0.5rem', background: 'var(--background)', borderRadius: 'var(--border-radius-lg)', display: 'flex', flexDirection: 'column', gap: '0.5rem',
                      border: '1px solid var(--input-border)', cursor: 'pointer', transition: 'all 0.2s', minWidth: 0
                    }}
                    onMouseOver={(e) => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
                    onMouseOut={(e) => { e.currentTarget.style.borderColor = 'var(--input-border)'; e.currentTarget.style.transform = 'translateY(0)' }}
                  >
                    <div style={{ position: 'relative', width: '100%', paddingTop: '100%', borderRadius: 'var(--border-radius-md)', overflow: 'hidden', background: 'var(--input-bg)' }}>
                      <img
                        src={item.videoMeta?.coverUrl || item.coverUrl || item.video?.cover || 'https://placehold.co/150x150/333/FFF?text=Video'}
                        alt="cover"
                        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    </div>
                    <div style={{ overflow: 'hidden', width: '100%' }}>
                      <div style={{ fontWeight: '600', fontSize: '0.8rem', textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                        @{item.authorMeta?.name || 'User'}
                      </div>
                      <div style={{ fontSize: '0.7rem', opacity: 0.7, textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                        {item.text || 'Нет описания'}
                      </div>

                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
                        gap: '0.25rem',
                        fontSize: '0.65rem',
                        marginTop: '0.5rem',
                        paddingTop: '0.5rem',
                        borderTop: '1px solid var(--input-border)',
                        color: 'var(--foreground)'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', whiteSpace: 'nowrap' }}><b>▶</b> {formatMetric(item.playCount)}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', whiteSpace: 'nowrap' }}><b>❤️</b> {formatMetric(item.diggCount)}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', whiteSpace: 'nowrap' }}><b>💬</b> {formatMetric(item.commentCount)}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', whiteSpace: 'nowrap' }}><b>↗️</b> {formatMetric(item.shareCount)}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', whiteSpace: 'nowrap' }}><b><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z" /></svg></b> {formatMetric(item.collectCount)}</div>
                        <div style={{ gridColumn: 'span 2', color: 'var(--primary)', fontWeight: 'bold', marginTop: '0.2rem' }}>
                          ER: {item.playCount > 0
                            ? (((item.diggCount || 0) + (item.commentCount || 0) + (item.shareCount || 0) + (item.collectCount || 0)) / item.playCount * 100).toFixed(1) + '%'
                            : '0%'}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Apify Keys Selector */}
        <div style={{
          marginTop: 'auto', // Pushes this and everything below to bottom
          paddingTop: '1.5rem',
          borderTop: '1px solid var(--input-border)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem'
        }}>
          <h3 style={{ fontSize: '0.9rem', color: 'var(--foreground)', margin: 0, fontWeight: '600' }}>Apify API</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {apifyKeys.length === 0 ? <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Загрузка...</span> : null}
            {apifyKeys.map(key => (
              <button
                key={key.id}
                onClick={() => {
                  setSelectedKeyId(key.id);
                  try {
                    localStorage.setItem('tiktok_scraper_key_id', key.id);
                  } catch (err) { }
                }}
                style={{
                  padding: '4px 8px',
                  fontSize: '0.8rem',
                  borderRadius: '6px',
                  border: selectedKeyId === key.id ? '1px solid #10b981' : '1px solid var(--input-border)',
                  background: selectedKeyId === key.id ? '#10b981' : 'transparent',
                  color: selectedKeyId === key.id ? '#fff' : 'var(--foreground)',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                {key.name}
              </button>
            ))}
          </div>
        </div>

        {/* API Balances Block */}
        <div style={{
          marginTop: '1rem',
          paddingTop: '1rem',
          borderTop: '1px solid var(--input-border)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem'
        }}>
          <h3 style={{ fontSize: '0.9rem', color: 'var(--foreground)', margin: 0, fontWeight: '600' }}>Баланс API</h3>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
            <span style={{ color: '#64748b' }}>Apify</span>
            <span style={{ fontWeight: '500', color: apiBalances.apify?.error ? '#ef4444' : 'var(--foreground)' }}>
              {apiBalances.apify ? (apiBalances.apify.error || apiBalances.apify.balance || '—') : 'Загрузка...'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
            <span style={{ color: '#64748b' }}>Groq (Whisper)</span>
            <span style={{ fontWeight: '500', color: apiBalances.groq?.error ? '#ef4444' : 'var(--foreground)' }}>
              {apiBalances.groq ? (apiBalances.groq.error || apiBalances.groq.balance || '—') : 'Загрузка...'}
            </span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content container" style={{ flex: 1 }}>
        <h1 className="title">TikTok Scraper</h1>
        <p className="subtitle">Быстрый сбор и анализ данных</p>

        <div className="glass-panel" style={{ padding: '2rem', width: '100%', maxWidth: '600px', marginBottom: '3rem', boxShadow: '0 20px 40px -15px rgba(0,0,0,0.05)' }}>
          <form onSubmit={handleSearch} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

            {/* Custom Segmented Control for Search Type */}
            <div style={{ display: 'flex', background: 'var(--input-bg)', padding: '0.4rem', borderRadius: '14px', border: '1px solid var(--input-border)' }}>
              <div
                onClick={() => setSearchType('keyword')}
                style={{ flex: 1, textAlign: 'center', padding: '0.75rem', borderRadius: '10px', cursor: 'pointer', fontWeight: '600', fontSize: '1rem', transition: 'all 0.2s ease', background: searchType === 'keyword' ? '#4f46e5' : 'transparent', color: searchType === 'keyword' ? 'white' : 'var(--foreground)', boxShadow: searchType === 'keyword' ? '0 4px 12px rgba(79, 70, 229, 0.3)' : 'none' }}>
                По названию
              </div>
              <div
                onClick={() => setSearchType('tag')}
                style={{ flex: 1, textAlign: 'center', padding: '0.75rem', borderRadius: '10px', cursor: 'pointer', fontWeight: '600', fontSize: '1rem', transition: 'all 0.2s ease', background: searchType === 'tag' ? '#4f46e5' : 'transparent', color: searchType === 'tag' ? 'white' : 'var(--foreground)', boxShadow: searchType === 'tag' ? '0 4px 12px rgba(79, 70, 229, 0.3)' : 'none' }}>
                По хэштегу
              </div>
            </div>

            {/* Query Input */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '1.25rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                </span>
                <input
                  type="text"
                  placeholder={searchType === 'keyword' ? "Что ищем? напр. смешные коты..." : "Какой хэштег? напр. тренды..."}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '1.25rem 1.25rem 1.25rem 3.5rem',
                    borderRadius: '16px',
                    border: '1px solid var(--input-border)',
                    background: 'var(--input-bg)',
                    color: 'var(--foreground)',
                    fontSize: '1.05rem',
                    outline: 'none',
                    transition: 'all 0.2s ease',
                    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)'
                  }}
                  onFocus={(e) => { e.target.style.borderColor = '#4f46e5'; e.target.style.boxShadow = '0 0 0 3px rgba(79, 70, 229, 0.15)'; }}
                  onBlur={(e) => { e.target.style.borderColor = 'var(--input-border)'; e.target.style.boxShadow = 'inset 0 2px 4px rgba(0,0,0,0.02)'; }}
                />
              </div>
            </div>

            {/* Grid for Numbers */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>

              {/* Request Parameters Section - Grey background */}
              <div style={{
                background: 'rgba(241, 245, 249, 0.5)',
                padding: '1rem',
                borderRadius: '16px',
                border: '1px solid rgba(226, 232, 240, 0.8)',
                display: 'flex', flexDirection: 'column', gap: '1rem'
              }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '-0.5rem' }}>Параметры сбора</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: '600', color: '#475569', marginLeft: '0.5rem' }}>Сколько парсить</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontWeight: 'bold' }}>#</span>
                    <input
                      type="number"
                      min="1"
                      max="1000"
                      value={maxItems}
                      onChange={(e) => setMaxItems(e.target.value)}
                      style={{
                        width: '100%', padding: '0.9rem 0.5rem 0.9rem 2.2rem', borderRadius: '12px', border: '1px solid var(--input-border)', background: '#ffffff', color: 'var(--foreground)', fontSize: '1rem', outline: 'none', transition: 'all 0.2s ease', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.02)'
                      }}
                      onFocus={(e) => { e.target.style.borderColor = '#4f46e5'; }}
                      onBlur={(e) => { e.target.style.borderColor = 'var(--input-border)'; }}
                    />
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginLeft: '0.5rem' }}>Больше роликов = дольше сбор</div>
                </div>
              </div>

              {/* Local Filters Section - Highlighted background */}
              <div style={{
                background: 'rgba(238, 242, 255, 0.5)',
                padding: '1rem',
                borderRadius: '16px',
                border: '1px solid rgba(199, 210, 254, 0.8)',
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem'
              }}>
                <div style={{ gridColumn: 'span 2', fontSize: '0.8rem', fontWeight: 'bold', color: '#4f46e5', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '-0.5rem' }}>Локальные фильтры (мгновенно)</div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: '600', color: '#475569', marginLeft: '0.5rem' }}>Мин. просмотров</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '0.8rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                    </span>
                    <input
                      type="number"
                      min="0"
                      placeholder="—"
                      value={minViews}
                      onChange={(e) => setMinViews(e.target.value)}
                      style={{
                        width: '100%', padding: '0.9rem 0.5rem 0.9rem 2.5rem', borderRadius: '12px', border: '1px solid var(--input-border)', background: '#ffffff', color: 'var(--foreground)', fontSize: '1rem', outline: 'none', transition: 'all 0.2s ease', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.02)'
                      }}
                      onFocus={(e) => { e.target.style.borderColor = '#4f46e5'; }}
                      onBlur={(e) => { e.target.style.borderColor = 'var(--input-border)'; }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: '600', color: '#475569', marginLeft: '0.5rem' }}>Мин. ER (%)</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '0.8rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontWeight: 'bold' }}>%</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      placeholder="—"
                      value={minEr}
                      onChange={(e) => setMinEr(e.target.value)}
                      style={{
                        width: '100%', padding: '0.9rem 0.5rem 0.9rem 2.2rem', borderRadius: '12px', border: '1px solid var(--input-border)', background: '#ffffff', color: 'var(--foreground)', fontSize: '1rem', outline: 'none', transition: 'all 0.2s ease', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.02)'
                      }}
                      onFocus={(e) => { e.target.style.borderColor = '#4f46e5'; }}
                      onBlur={(e) => { e.target.style.borderColor = 'var(--input-border)'; }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: '600', color: '#475569', marginLeft: '0.5rem' }}>С даты</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      style={{
                        width: '100%', padding: '0.9rem 0.5rem', borderRadius: '12px', border: '1px solid var(--input-border)', background: '#ffffff', color: 'var(--foreground)', fontSize: '0.9rem', outline: 'none', transition: 'all 0.2s ease', fontFamily: 'inherit', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.02)'
                      }}
                      onFocus={(e) => { e.target.style.borderColor = '#4f46e5'; }}
                      onBlur={(e) => { e.target.style.borderColor = 'var(--input-border)'; }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: '600', color: '#475569', marginLeft: '0.5rem' }}>По дату</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      style={{
                        width: '100%', padding: '0.9rem 0.5rem', borderRadius: '12px', border: '1px solid var(--input-border)', background: '#ffffff', color: 'var(--foreground)', fontSize: '0.9rem', outline: 'none', transition: 'all 0.2s ease', fontFamily: 'inherit', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.02)'
                      }}
                      onFocus={(e) => { e.target.style.borderColor = '#4f46e5'; }}
                      onBlur={(e) => { e.target.style.borderColor = 'var(--input-border)'; }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || !query.trim()}
              style={{
                marginTop: '0.5rem',
                width: '100%',
                padding: '1.15rem',
                border: 'none',
                borderRadius: '16px',
                background: loading || !query.trim() ? '#e2e8f0' : 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                color: loading || !query.trim() ? '#94a3b8' : 'white',
                fontSize: '1.1rem',
                fontWeight: '700',
                cursor: loading || !query.trim() ? 'not-allowed' : 'pointer',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '0.75rem',
                boxShadow: loading || !query.trim() ? 'none' : '0 10px 25px -5px rgba(99, 102, 241, 0.4)',
                transform: 'scale(1)',
                transition: 'all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
              }}
              onMouseOver={(e) => { if (!loading && query.trim()) e.currentTarget.style.transform = 'translateY(-2px)' }}
              onMouseOut={(e) => { if (!loading && query.trim()) e.currentTarget.style.transform = 'translateY(0)' }}
            >
              {loading ? (
                <>
                  <div className="spinner" style={{ width: '18px', height: '18px', borderWidth: '2px', borderColor: 'transparent', borderTopColor: '#94a3b8', borderRightColor: '#94a3b8' }}></div> Сбор данных...
                </>
              ) : (
                <>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                  Запустить сбор
                </>
              )}
            </button>
          </form>
        </div>

        {/* Results Area */}
        <div className="results-container" style={{ width: '100%', maxWidth: '1200px' }}>
          {error && (
            <div style={{ padding: '1.5rem', background: 'var(--error)', color: 'white', borderRadius: 'var(--border-radius-lg)', marginBottom: '2rem', textAlign: 'center', fontWeight: 'bold' }}>
              {error}
            </div>
          )}

          {loading && (
            <div style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100vw',
              height: '100vh',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0, 0, 0, 0.6)',
              backdropFilter: 'blur(8px)',
              zIndex: 9999,
              animation: 'fade-in 0.3s ease-out'
            }}>
              <img
                src="/olka_spinner.png"
                alt="Олька крутится"
                className="image-spinner"
              />
              <p className="pulse-text" style={{ fontSize: '0.8rem', fontWeight: '300', color: '#ffffff', letterSpacing: '0.05em' }}>
                Олька крутится - видосы грузятся⏳
              </p>
            </div>
          )}

          {/* Top Control Bar for Filtering stats */}
          {!loading && hasSearched && results.length > 0 && !error && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', padding: '1rem 1.5rem', background: 'var(--card-bg)', borderRadius: '16px', border: '1px solid var(--input-border)', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <button
                  onClick={handleRefreshStats}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--input-bg)',
                    border: '1px solid var(--input-border)', padding: '0.5rem 1rem', borderRadius: '10px',
                    color: 'var(--foreground)', fontSize: '0.9rem', cursor: 'pointer', transition: 'all 0.2s',
                    fontWeight: '500'
                  }}
                  onMouseOver={(e) => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)' }}
                  onMouseOut={(e) => { e.currentTarget.style.borderColor = 'var(--input-border)'; e.currentTarget.style.color = 'var(--foreground)' }}
                  title="Обновить просмотры, лайки и ER по всем видео в выдаче"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
                  Обновить метрики
                </button>
              </div>

              <div style={{ fontSize: '0.95rem', color: '#64748b' }}>
                Отображено: <span style={{ fontWeight: 'bold', color: 'var(--foreground)' }}>{getFilteredResults(results).length}</span> из {(results || []).length} спарсеных
              </div>
            </div>
          )}

          {/* Results Grid */}
          {!loading && hasSearched && getFilteredResults(results).length === 0 && (results || []).length > 0 && !error && (
            <div style={{ textAlign: 'center', opacity: 0.7, padding: '3rem' }}>
              <h2>Слишком строгие фильтры</h2>
              <p>Мы спарсили {results.length} видео, но ни одно не подходит под ваши фильтры (Просмотры, Даты, ER%). Смягчите условия.</p>
            </div>
          )}

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: '1.5rem',
            alignItems: 'start',
            paddingBottom: '2rem'
          }}>
            {!loading && hasSearched && getFilteredResults(results).map((item, index) => {
              const isSaved = savedVideos.some(v => v.id === item.id);

              return (
                <div key={item.id || index} className="glass-panel video-card" style={{ position: 'relative', padding: 0, display: 'flex', flexDirection: 'column', transition: 'transform 0.3s', cursor: 'default', overflow: 'hidden', height: '100%' }}>

                  {/* Content Wrapper */}
                  <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                    {/* Верхний блок: Медиа + Оверлеи */}
                    <div style={{
                      width: '100%',
                      flex: '0 0 auto',
                      background: '#000',
                      aspectRatio: '9/16',
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      position: 'relative',
                      overflow: 'hidden'
                    }}>
                      {item.videoMeta?.downloadAddr || item.videoMeta?.playAddr || item.videoUrl || item.video?.playAddr || item.video?.downloadAddr ? (
                        <video
                          src={item.videoMeta?.downloadAddr || item.videoMeta?.playAddr || item.videoUrl || item.video?.playAddr || item.video?.downloadAddr}
                          poster={item.videoMeta?.coverUrl || item.coverUrl || item.video?.cover}
                          controls
                          playsInline
                          preload="metadata"
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (item.videoMeta?.coverUrl || item.coverUrl || item.video?.cover) ? (
                        <img
                          src={item.videoMeta?.coverUrl || item.coverUrl || item.video?.cover}
                          alt="Video cover"
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        <div style={{ color: 'rgba(255,255,255,0.5)' }}>Нет медиа</div>
                      )}

                      {/* Оверлей: Иконки сверху */}
                      <div style={{ position: 'absolute', top: '1rem', left: '1rem', right: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', pointerEvents: 'none', zIndex: 10 }}>

                        {/* TikTok / Reels Badge */}
                        <div style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', padding: '0.4rem 0.8rem', borderRadius: '100px', display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'white', fontSize: '0.85rem', fontWeight: 'bold' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" /></svg>
                          Reels
                        </div>

                        {/* Right icons (Save, Share) */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', pointerEvents: 'auto' }}>
                          {/* Save Button */}
                          <button
                            onClick={() => toggleSaveVideo(item)}
                            style={{
                              background: 'rgba(255,255,255,0.9)',
                              border: 'none',
                              borderRadius: '50%',
                              width: '36px',
                              height: '36px',
                              display: 'flex',
                              justifyContent: 'center',
                              alignItems: 'center',
                              fontSize: '1rem',
                              cursor: 'pointer',
                              color: isSaved ? '#ef4444' : '#64748b',
                              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                              transition: 'transform 0.2s',
                              marginBottom: '0.4rem'
                            }}
                            onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
                            onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
                            title="Сохранить"
                          >
                            {isSaved ? '❤️' : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>}
                          </button>

                          {/* Download Button */}
                          <button
                            onClick={async (e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              try {
                                const videoUrl = item.videoMeta?.downloadAddr || item.videoMeta?.playAddr || item.videoUrl || item.video?.playAddr || item.video?.downloadAddr || item.playAddr || item.webVideoUrl || `https://www.tiktok.com/@${item.authorMeta?.name || 'user'}/video/${item.id}`;

                                const response = await fetch('/api/proxy-download', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ url: videoUrl })
                                });

                                if (!response.ok) {
                                  const errData = await response.json();
                                  throw new Error(`Proxy error: ${errData.details || response.statusText}`);
                                }

                                const blob = await response.blob();
                                const blobUrl = window.URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.style.display = 'none';
                                a.href = blobUrl;
                                const filename = response.headers.get('Content-Disposition')?.split('filename="')?.[1]?.split('"')?.[0] || `video-${item.id || Date.now()}.mp4`;
                                a.download = filename;
                                document.body.appendChild(a);
                                a.click();
                                window.URL.revokeObjectURL(blobUrl);
                                document.body.removeChild(a);
                              } catch (error) {
                                console.error('Download failed:', error);
                                alert(`Не удалось скачать видео: ${error.message}`);
                              }
                            }}
                            style={{
                              background: 'rgba(255,255,255,0.9)',
                              border: 'none',
                              borderRadius: '50%',
                              width: '36px',
                              height: '36px',
                              display: 'flex',
                              justifyContent: 'center',
                              alignItems: 'center',
                              fontSize: '1rem',
                              cursor: 'pointer',
                              color: '#64748b',
                              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                              transition: 'transform 0.2s',
                              marginBottom: '0.4rem'
                            }}
                            onMouseOver={(e) => {
                              e.currentTarget.style.transform = 'scale(1.1)';
                              e.currentTarget.style.color = '#3b82f6';
                            }}
                            onMouseOut={(e) => {
                              e.currentTarget.style.transform = 'scale(1)';
                              e.currentTarget.style.color = '#64748b';
                            }}
                            title="Скачать видео"
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                          </button>

                          {item.webVideoUrl && (
                            <a
                              href={item.webVideoUrl}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                background: 'rgba(0,0,0,0.4)',
                                backdropFilter: 'blur(4px)',
                                border: '1px solid rgba(255,255,255,0.2)',
                                color: 'white',
                                borderRadius: '50%',
                                width: '36px',
                                height: '36px',
                                display: 'flex',
                                justifyContent: 'center',
                                alignItems: 'center',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                transition: 'background 0.2s'
                              }}
                              onMouseOver={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.6)'}
                              onMouseOut={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.4)'}
                              title="Смотреть в TikTok"
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                            </a>
                          )}
                        </div>
                      </div>
                      {/* Оверлей: Метрики внизу видео (жидкое стекло) */}
                      <div style={{
                        position: 'absolute',
                        bottom: '8px', // Отступ от края видео 3мм (~8px)
                        left: '50%',
                        transform: 'translateX(-50%)',
                        width: 'calc(100% - 16px)', // Чтобы был отступ и слева/справа
                        background: 'rgba(0, 0, 0, 0.15)', // Еще более тонкая подложка
                        backdropFilter: 'blur(8px)',       // Меньше блюра
                        WebkitBackdropFilter: 'blur(8px)',
                        borderRadius: '20px',
                        padding: '0.4rem 0.5rem', // Меньше высота плашки
                        display: 'flex',
                        justifyContent: 'space-around', // Равномерное распределение
                        alignItems: 'center',
                        color: 'white',
                        pointerEvents: 'auto',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.2)'
                      }}>
                        {/* Просмотры */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.1rem' }}>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                          <span style={{ fontSize: '0.8rem', fontWeight: '600' }}>{formatMetric(item.playCount)}</span>
                        </div>

                        {/* Лайки */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.1rem' }}>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
                          <span style={{ fontSize: '0.8rem', fontWeight: '600' }}>{formatMetric(item.diggCount)}</span>
                        </div>

                        {/* Комментарии */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.1rem' }}>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                          <span style={{ fontSize: '0.8rem', fontWeight: '600' }}>{formatMetric(item.commentCount)}</span>
                        </div>

                        {/* Репосты / Отправки */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.1rem' }}>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                          <span style={{ fontSize: '0.8rem', fontWeight: '600' }}>{formatMetric(item.shareCount)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Нижний блок: Инфо + Кнопки */}
                    <div style={{ padding: '0 1rem 1rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', flex: 1 }}>

                      {/* Автор */}
                      <div style={{ display: 'flex', alignItems: 'center', marginTop: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', overflow: 'hidden' }}>
                          {item.authorMeta?.avatar ? (
                            <img src={item.authorMeta.avatar} alt="avatar" style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover' }} />
                          ) : (
                            <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--input-border)' }}></div>
                          )}
                          <div style={{ fontWeight: '700', fontSize: '1rem', color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            @{item.authorMeta?.name || 'Неизвестный'}
                          </div>
                        </div>
                      </div>

                      {/* Описание видео (2 строки) */}
                      <div style={{
                        fontSize: '0.9rem',
                        lineHeight: '1.4',
                        color: '#475569',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden'
                      }}>
                        {item.text || 'Описание отсутствует.'}
                      </div>

                      {/* ER Badge */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <div style={{
                          background: 'var(--primary)',
                          color: 'white',
                          padding: '0.3rem 0.6rem',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          fontWeight: 'bold',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.3rem'
                        }}>
                          ER: {item.playCount > 0 ? (((item.diggCount || 0) + (item.commentCount || 0) + (item.shareCount || 0) + (item.collectCount || 0)) / item.playCount * 100).toFixed(2) + '%' : '0%'}
                        </div>
                      </div>

                      {/* Блок Транскрибации / Анализа */}
                      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        {/* Дата публикации */}
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: '400' }}>
                          {item.createTime ? new Date(item.createTime * 1000).toLocaleDateString('ru-RU') : ''}
                        </div>

                        <button
                          onClick={() => { setSelectedVideo(item); setModalTab('transcript'); }}
                          style={{
                            width: '100%',
                            padding: '0.8rem',
                            background: '#312e81',
                            color: 'white',
                            border: 'none',
                            borderRadius: '12px',
                            fontWeight: '700',
                            fontSize: '0.95rem',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            boxShadow: '0 4px 14px rgba(49, 46, 129, 0.25)',
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            gap: '0.5rem'
                          }}
                          onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
                          onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                        >
                          Анализ видео
                        </button>
                      </div>

                    </div>
                  </div>

                </div>
              )
            })}
          </div>

        </div>
      </main>

      <div style={{
        position: 'fixed',
        bottom: '1rem',
        right: '1.5rem',
        fontSize: '0.8rem',
        color: 'var(--foreground)',
        opacity: 0.5,
        fontWeight: '300',
        letterSpacing: '0.05em',
        pointerEvents: 'none',
        textShadow: '0 1px 2px rgba(0,0,0,0.1)',
        zIndex: 50
      }}>
        Сделано специально для Ольки❤️
      </div>

      {/* Video Details Modal */}
      {selectedVideo && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, width: '100vw', height: '100vh',
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          zIndex: 100000,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '2rem'
        }} onClick={(e) => {
          if (e.target === e.currentTarget) setSelectedVideo(null);
        }}>

          <div style={{
            background: 'white',
            borderRadius: '24px',
            width: '100%',
            maxWidth: '1200px',
            height: '90vh',
            display: 'flex',
            overflow: 'hidden',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            position: 'relative'
          }}>
            {/* Close Button */}
            <button onClick={() => setSelectedVideo(null)} style={{
              position: 'absolute', top: '1.5rem', right: '1.5rem',
              width: '36px', height: '36px', borderRadius: '50%',
              background: '#f1f5f9', border: 'none', cursor: 'pointer',
              display: 'flex', justifyContent: 'center', alignItems: 'center',
              color: '#64748b', zIndex: 10, transition: 'all 0.2s'
            }} onMouseOver={e => e.currentTarget.style.background = '#e2e8f0'} onMouseOut={e => e.currentTarget.style.background = '#f1f5f9'}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>

            {/* Left Column */}
            <div style={{
              width: '340px',
              background: '#ffffff',
              borderRight: '1px solid #f1f5f9',
              display: 'flex',
              flexDirection: 'column',
              padding: '1.25rem',
              flexShrink: 0,
              overflowY: 'auto', // Re-enabled scrolling so content is never cropped
              height: '100%',
            }}>
              {/* Video Player / iframe container */}
              <div style={{
                height: '380px',
                width: '100%',
                background: '#0a0a0c',
                borderRadius: '16px',
                overflow: 'hidden',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                cursor: 'pointer'
              }}
                onClick={(e) => {
                  const videoEl = e.currentTarget.querySelector('video');
                  if (videoEl) {
                    if (videoEl.paused) videoEl.play();
                    else videoEl.pause();
                  }
                }}>
                {selectedVideo.videoMeta?.downloadAddr || selectedVideo.videoMeta?.playAddr || selectedVideo.videoUrl || selectedVideo.video?.playAddr || selectedVideo.video?.downloadAddr ? (
                  <video
                    src={selectedVideo.videoMeta?.downloadAddr || selectedVideo.videoMeta?.playAddr || selectedVideo.videoUrl || selectedVideo.video?.playAddr || selectedVideo.video?.downloadAddr}
                    poster={selectedVideo.videoMeta?.coverUrl || selectedVideo.coverUrl || selectedVideo.video?.cover}
                    controls
                    autoPlay
                    playsInline
                    style={{ maxHeight: '100%', width: '100%', objectFit: 'contain', pointerEvents: 'auto' }}
                  />
                ) : selectedVideo.id ? (
                  <div style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative' }}>
                    <iframe
                      title="TikTok Video Player"
                      src={`https://www.tiktok.com/embed/v2/${selectedVideo.id}?lang=ru-RU`}
                      style={{
                        width: '100%',
                        height: 'calc(100% + 160px)', // Make it taller than container to push UI out
                        border: 'none',
                        background: 'transparent',
                        position: 'absolute',
                        top: 0,
                        left: 0
                      }}
                      allow="autoplay; fullscreen"
                    />
                  </div>
                ) : (
                  <img src={selectedVideo.videoMeta?.coverUrl || selectedVideo.coverUrl || selectedVideo.video?.cover} style={{ height: '100%', width: '100%', objectFit: 'contain' }} alt="Cover" />
                )}
              </div>

              {/* Actions & Date */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem' }}>
                <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: '500' }}>
                  {selectedVideo.createTime ? new Date(selectedVideo.createTime * 1000).toLocaleDateString('ru-RU') : 'Недавно'}
                </span>

                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                  <button onClick={() => toggleSaveVideo(selectedVideo)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: savedVideos.some(v => v.id === selectedVideo.id) ? '#ef4444' : '#64748b', padding: 0 }} title="Сохранить">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill={savedVideos.some(v => v.id === selectedVideo.id) ? '#ef4444' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
                  </button>

                  {/* Download Button */}
                  <button
                    onClick={async (e) => {
                      e.preventDefault();
                      try {
                        const videoUrl = selectedVideo.videoMeta?.downloadAddr || selectedVideo.videoMeta?.playAddr || selectedVideo.videoUrl || selectedVideo.video?.playAddr || selectedVideo.video?.downloadAddr || selectedVideo.playAddr || selectedVideo.webVideoUrl || `https://www.tiktok.com/@${selectedVideo.authorMeta?.name || 'user'}/video/${selectedVideo.id}`;

                        const response = await fetch('/api/proxy-download', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ url: videoUrl })
                        });

                        if (!response.ok) {
                          const errData = await response.json();
                          throw new Error(`Proxy error: ${errData.details || response.statusText}`);
                        }

                        const blob = await response.blob();
                        const blobUrl = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.style.display = 'none';
                        a.href = blobUrl;
                        const filename = response.headers.get('Content-Disposition')?.split('filename="')?.[1]?.split('"')?.[0] || `video-${selectedVideo.id || Date.now()}.mp4`;
                        a.download = filename;
                        document.body.appendChild(a);
                        a.click();
                        window.URL.revokeObjectURL(blobUrl);
                        document.body.removeChild(a);
                      } catch (error) {
                        console.error('Download failed:', error);
                        alert(`Не удалось скачать видео: ${error.message}`);
                      }
                    }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 0, display: 'flex' }}
                    title="Скачать видео"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                  </button>

                  <a href={selectedVideo.webVideoUrl || `https://www.tiktok.com/@${selectedVideo.authorMeta?.name}/video/${selectedVideo.id}`} target="_blank" rel="noreferrer" style={{ color: '#64748b', display: 'flex' }} title="Смотреть в TikTok">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                  </a>
                </div>
              </div>

              {/* Author */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.75rem' }}>
                {selectedVideo.authorMeta?.avatar ? (
                  <img src={selectedVideo.authorMeta.avatar} alt="avatar" style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#f1f5f9' }}></div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontWeight: '700', fontSize: '0.9rem', color: '#334155' }}>@{selectedVideo.authorMeta?.name || 'Неизвестный'}</span>
                </div>
              </div>

              {/* Description */}
              <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#475569', lineHeight: '1.4', wordBreak: 'break-word', whiteSpace: 'pre-wrap', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {selectedVideo.text || 'Описание отсутствует.'}
              </div>

              {/* Stats List */}
              <div style={{ marginTop: 'auto', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {/* View row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: '#f8fafc', borderRadius: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748b' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                    <span style={{ fontSize: '0.85rem', fontWeight: '500' }}>Просмотры</span>
                  </div>
                  <span style={{ fontWeight: '700', fontSize: '0.9rem', color: '#334155' }}>{formatMetric(selectedVideo.playCount)}</span>
                </div>
                {/* Likes row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: '#f8fafc', borderRadius: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748b' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
                    <span style={{ fontSize: '0.85rem', fontWeight: '500' }}>Лайки</span>
                  </div>
                  <span style={{ fontWeight: '700', fontSize: '0.9rem', color: '#334155' }}>{formatMetric(selectedVideo.diggCount)}</span>
                </div>
                {/* Comments row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: '#f8fafc', borderRadius: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748b' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                    <span style={{ fontSize: '0.85rem', fontWeight: '500' }}>Комментарии</span>
                  </div>
                  <span style={{ fontWeight: '700', fontSize: '0.9rem', color: '#334155' }}>{formatMetric(selectedVideo.commentCount)}</span>
                </div>
                {/* Saves (Collects) row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: '#f8fafc', borderRadius: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748b' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
                    <span style={{ fontSize: '0.85rem', fontWeight: '500' }}>Сохранения</span>
                  </div>
                  <span style={{ fontWeight: '700', fontSize: '0.9rem', color: '#334155' }}>{formatMetric(selectedVideo.collectCount)}</span>
                </div>
                {/* Shares row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: '#f8fafc', borderRadius: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748b' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                    <span style={{ fontSize: '0.85rem', fontWeight: '500' }}>Репосты</span>
                  </div>
                  <span style={{ fontWeight: '700', fontSize: '0.9rem', color: '#334155' }}>{formatMetric(selectedVideo.shareCount)}</span>
                </div>
                {/* ER row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: '#f8fafc', borderRadius: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748b' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
                    <span style={{ fontSize: '0.85rem', fontWeight: '500' }}>ER</span>
                  </div>
                  <span style={{ fontWeight: '700', fontSize: '0.9rem', color: '#334155' }}>
                    {selectedVideo.playCount > 0 ? (((selectedVideo.diggCount || 0) + (selectedVideo.commentCount || 0) + (selectedVideo.shareCount || 0) + (selectedVideo.collectCount || 0)) / selectedVideo.playCount * 100).toFixed(2) : '0'}%
                  </span>
                </div>
              </div>
            </div>

            {/* Right Column */}
            <div style={{
              flex: 1,
              padding: '2rem 2.5rem',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column'
            }}>
              {/* Header: Title + Region */}
              <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: '600', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Тема видео
              </div>
              <h1 style={{ margin: '0 0 0.75rem 0', fontSize: '1.5rem', color: '#0f172a', lineHeight: '1.3' }}>
                {selectedVideo.text ? selectedVideo.text.split('\n')[0].slice(0, 100) : 'Без названия'}
              </h1>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: '#475569', marginBottom: '1.25rem' }}>
                <span>Язык/Регион:</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontWeight: '500', color: '#334155' }}>
                  {(() => {
                    const region = (
                      selectedVideo.textLanguage ||
                      selectedVideo.authorMeta?.region ||
                      selectedVideo.videoMeta?.region ||
                      selectedVideo.language ||
                      selectedVideo.country ||
                      selectedVideo.locationCreated ||
                      selectedVideo.locale
                    )?.toUpperCase();
                    const map = {
                      'RU': '🇷🇺 Русский', 'US': '🇺🇸 Английский', 'GB': '🇬🇧 Английский', 'EN': '🇺🇸 Английский', 'UK': '🇬🇧 Английский',
                      'UA': '🇺🇦 Украинский', 'DE': '🇩🇪 Немецкий', 'FR': '🇫🇷 Французский', 'ES': '🇪🇸 Испанский', 'IT': '🇮🇹 Итальянский',
                      'PL': '🇵🇱 Польский', 'TR': '🇹🇷 Турецкий', 'KZ': '🇰🇿 Казахский', 'BR': '🇧🇷 Португальский', 'PT': '🇵🇹 Португальский',
                      'KR': '🇰🇷 Корейский', 'JP': '🇯🇵 Японский', 'CN': '🇨🇳 Китайский', 'TW': '🇹🇼 Китайский (Тайвань)',
                      'IN': '🇮🇳 Хинди (Индия)', 'ID': '🇮🇩 Индонезийский', 'VN': '🇻🇳 Вьетнамский', 'TH': '🇹🇭 Тайский',
                      'AE': '🇦🇪 Арабский', 'SA': '🇸🇦 Арабский', 'EG': '🇪🇬 Арабский'
                    };
                    if (region && map[region]) return map[region];
                    if (region && region.length <= 4) return `🌐 ` + region;
                    return '🏳️ Неизвестно';
                  })()}
                </span>
              </div>

              {/* ===== TAB NAVIGATION ===== */}
              <div style={{
                display: 'flex',
                gap: '0.4rem',
                padding: '0.35rem',
                background: '#f1f5f9',
                borderRadius: '14px',
                marginBottom: '1.5rem'
              }}>
                {[
                  { id: 'transcript', icon: '🎤', label: 'Текст' },
                  { id: 'analysis', icon: '✨', label: 'Анализ' },
                  { id: 'ideas', icon: '💡', label: 'Идеи' },
                  { id: 'hook', icon: '🎣', label: 'Хук' },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setModalTab(tab.id)}
                    style={{
                      flex: 1,
                      padding: '0.6rem 0.5rem',
                      border: 'none',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      fontWeight: '600',
                      fontSize: '0.85rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.35rem',
                      transition: 'all 0.2s ease',
                      background: modalTab === tab.id ? '#4f46e5' : 'transparent',
                      color: modalTab === tab.id ? 'white' : '#64748b',
                      boxShadow: modalTab === tab.id ? '0 4px 12px rgba(79, 70, 229, 0.3)' : 'none',
                    }}
                  >
                    <span style={{ fontSize: '1rem' }}>{tab.icon}</span>
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* ===== TAB CONTENT ===== */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>

                {/* TAB: Transcript */}
                {modalTab === 'transcript' && (
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                      <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a' }}>Транскрибация</h3>
                      {transcriptions[selectedVideo.id]?.text && (
                        <button onClick={() => { navigator.clipboard.writeText(transcriptions[selectedVideo.id].text); setCopiedId('modal_' + selectedVideo.id); setTimeout(() => setCopiedId(null), 2000); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: copiedId === 'modal_' + selectedVideo.id ? '#10b981' : '#64748b', transition: 'all 0.2s', padding: '0.4rem', borderRadius: '8px' }}>
                          {copiedId === 'modal_' + selectedVideo.id ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"></polyline></svg> : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>}
                        </button>
                      )}
                    </div>

                    {!transcriptions[selectedVideo.id]?.text && !transcriptions[selectedVideo.id]?.error ? (
                      <div style={{ background: '#f8fafc', borderRadius: '16px', padding: '2.5rem', textAlign: 'center', border: '1px dashed #cbd5e1', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎤</div>
                        <p style={{ color: '#64748b', margin: '0 0 1.25rem 0', fontSize: '0.95rem', maxWidth: '300px' }}>
                          {transcribingIds.has(selectedVideo.id) ? 'Нейросеть распознает речь...' : 'Транскрибируйте аудио видео в текст с помощью Groq Whisper'}
                        </p>
                        <button
                          onClick={() => handleTranscribe(selectedVideo)}
                          disabled={transcribingIds.has(selectedVideo.id)}
                          style={{
                            padding: '0.85rem 2rem',
                            background: transcribingIds.has(selectedVideo.id) ? '#4f46e5' : 'linear-gradient(135deg, #312e81, #4f46e5)',
                            color: 'white', border: 'none', borderRadius: '12px', fontWeight: '600', fontSize: '0.95rem',
                            cursor: transcribingIds.has(selectedVideo.id) ? 'not-allowed' : 'pointer',
                            display: 'inline-flex', alignItems: 'center', gap: '0.5rem', transition: 'all 0.2s',
                            boxShadow: '0 4px 14px rgba(79, 70, 229, 0.3)',
                          }}
                        >
                          {transcribingIds.has(selectedVideo.id) ? (
                            <><svg style={{ animation: 'spin 1s linear infinite' }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg> Анализируем аудио...</>
                          ) : (
                            'Запустить транскрибацию'
                          )}
                        </button>
                      </div>
                    ) : transcriptions[selectedVideo.id]?.error ? (
                      <div style={{ background: '#fef2f2', color: '#ef4444', padding: '1.5rem', borderRadius: '16px', border: '1px solid #fecaca' }}>
                        <b>Ошибка:</b><br />{transcriptions[selectedVideo.id].error}
                      </div>
                    ) : (
                      <div style={{ background: '#f8fafc', borderRadius: '16px', padding: '1.5rem', border: '1px solid #e2e8f0', color: '#334155', lineHeight: '1.7', fontSize: '0.95rem', flex: 1, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
                        {transcriptions[selectedVideo.id].text}
                      </div>
                    )}
                  </div>
                )}

                {/* TAB: Анализ — full one-click analysis */}
                {modalTab === 'analysis' && (() => {
                  const videoId = selectedVideo.id;
                  const analysis = videoAnalysis[videoId];
                  const isLoading = analysis?.loading;
                  const error = analysis?.error;
                  const hasResult = analysis && !isLoading && !error && (analysis.summary || analysis.hookPhrase);

                  // Empty state
                  if (!analysis || (!hasResult && !isLoading && !error)) {
                    return (
                      <div style={{ background: '#f8fafc', borderRadius: '16px', padding: '2.5rem', textAlign: 'center', border: '1px dashed #cbd5e1', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✨</div>
                        <p style={{ color: '#64748b', margin: '0 0 0.5rem 0', fontSize: '1rem', fontWeight: '600' }}>Полный анализ видео</p>
                        <p style={{ color: '#94a3b8', margin: '0 0 1.5rem 0', fontSize: '0.88rem', maxWidth: '320px', lineHeight: '1.5' }}>
                          {transcriptions[videoId]?.text
                            ? 'Транскрипция готова. AI проанализирует суть, структуру и хуки.'
                            : 'Сначала транскрибирует аудио, затем AI разберёт суть, структуру и хуки.'}
                        </p>
                        <button
                          onClick={handleFullAnalysis}
                          style={{ padding: '0.9rem 2rem', background: 'linear-gradient(135deg, #312e81, #4f46e5)', color: 'white', border: 'none', borderRadius: '12px', fontWeight: '700', fontSize: '1rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.6rem', boxShadow: '0 4px 14px rgba(79,70,229,0.35)', transition: 'all 0.2s' }}
                          onMouseOver={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                          onMouseOut={e => e.currentTarget.style.transform = 'translateY(0)'}
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3l1.9 5.8 1.9-5.8a2 2 0 0 1 1.3-1.3l5.8-1.9-5.8-1.9a2 2 0 0 1-1.3-1.3z"></path></svg>
                          Анализ видео
                        </button>
                      </div>
                    );
                  }

                  // Loading state
                  if (isLoading) {
                    return (
                      <div style={{ background: '#f8fafc', borderRadius: '16px', padding: '3rem', textAlign: 'center', border: '1px solid #e2e8f0', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                        <svg style={{ animation: 'spin 1.5s linear infinite', marginBottom: '1rem' }} width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3l1.9 5.8 1.9-5.8a2 2 0 0 1 1.3-1.3l5.8-1.9-5.8-1.9a2 2 0 0 1-1.3-1.3z"></path></svg>
                        <p style={{ color: '#4f46e5', fontWeight: '700', fontSize: '1rem', margin: 0 }}>
                          {analysisStep === 'transcribing' ? 'Транскрибирую аудио...' : 'AI анализирует видео...'}
                        </p>
                        <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: '0.5rem 0 0 0' }}>
                          {analysisStep === 'transcribing' ? 'Это может занять 30-60 секунд' : 'Обычно 5-15 секунд'}
                        </p>
                      </div>
                    );
                  }

                  // Error state
                  if (error) {
                    return (
                      <div style={{ background: '#fef2f2', color: '#ef4444', padding: '1.5rem', borderRadius: '16px', border: '1px solid #fecaca' }}>
                        <b>Ошибка:</b><br />{error}
                        <div style={{ marginTop: '1rem' }}>
                          <button onClick={handleFullAnalysis} style={{ padding: '0.5rem 1rem', background: '#ef4444', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '0.85rem' }}>Попробовать снова</button>
                        </div>
                      </div>
                    );
                  }

                  // Result state
                  const sectionStyle = { marginBottom: '1.5rem' };
                  const sectionTitleStyle = { fontSize: '0.95rem', fontWeight: '700', color: '#0f172a', margin: '0 0 0.6rem 0' };
                  const sectionTextStyle = { color: '#475569', fontSize: '0.9rem', lineHeight: '1.6', margin: 0, background: '#f8fafc', padding: '0.85rem 1rem', borderRadius: '10px', border: '1px solid #e2e8f0' };

                  return (
                    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0' }}>
                      {/* Refresh button */}
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
                        <button onClick={handleFullAnalysis} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '0.3rem', borderRadius: '8px' }} title="Пересчитать">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
                        </button>
                      </div>

                      {/* Суть */}
                      {analysis.summary && (
                        <div style={sectionStyle}>
                          <p style={sectionTitleStyle}>Суть</p>
                          <p style={sectionTextStyle}>{analysis.summary}</p>
                        </div>
                      )}

                      {/* Структура */}
                      {analysis.structure?.length > 0 && (
                        <div style={sectionStyle}>
                          <p style={sectionTitleStyle}>Структура</p>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {analysis.structure.map((item, i) => (
                              <div key={i} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0', flexShrink: 0, paddingTop: '2px' }}>
                                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: i === analysis.structure.length - 1 ? '#4f46e5' : '#f97316', flexShrink: 0 }} />
                                  {i < analysis.structure.length - 1 && <div style={{ width: '2px', flex: 1, background: '#e2e8f0', minHeight: '24px' }} />}
                                </div>
                                <div style={{ flex: 1, paddingBottom: '0.5rem' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: '500', whiteSpace: 'nowrap' }}>{item.start}-{item.end} сек</span>
                                    <span style={{ fontSize: '0.88rem', fontWeight: '700', color: '#1e293b' }}>{item.title}</span>
                                  </div>
                                  <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b', lineHeight: '1.5' }}>{item.description}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Хук фраза */}
                      {analysis.hookPhrase && analysis.hookPhrase !== 'null' && (
                        <div style={sectionStyle}>
                          <p style={sectionTitleStyle}>Хук фраза</p>
                          <p style={{ ...sectionTextStyle, fontStyle: 'italic', borderLeft: '3px solid #4f46e5' }}>{analysis.hookPhrase}</p>
                        </div>
                      )}

                      {/* Визуальный хук */}
                      {analysis.visualHook && analysis.visualHook !== 'null' && (
                        <div style={sectionStyle}>
                          <p style={sectionTitleStyle}>Визуальный хук</p>
                          <p style={sectionTextStyle}>{analysis.visualHook}</p>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* TAB: Ideas / Hook (AI tabs — shared layout) */}
                {['ideas', 'hook'].includes(modalTab) && (() => {
                  const tabConfig = {
                    ideas: { icon: '💡', title: 'Идеи для видео', description: 'AI сгенерирует 5 идей для похожих видео на основе анализа этого ролика', buttonText: 'Придумать идеи' },
                    hook: { icon: '🎣', title: 'Хуки (первые 3 сек)', description: 'AI придумает 5 вариантов цепляющего начала для похожего видео', buttonText: 'Сгенерировать хуки' },
                  };
                  const cfg = tabConfig[modalTab];
                  const videoId = selectedVideo.id;
                  const result = aiResults[videoId]?.[modalTab];
                  const error = aiResults[videoId]?.[`${modalTab}_error`];
                  const isLoading = aiLoadingTab === modalTab;

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a' }}>{cfg.icon} {cfg.title}</h3>
                        {result && (
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            {/* Copy button */}
                            <button onClick={() => { navigator.clipboard.writeText(result); setCopiedId('ai_' + modalTab + '_' + videoId); setTimeout(() => setCopiedId(null), 2000); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: copiedId === 'ai_' + modalTab + '_' + videoId ? '#10b981' : '#64748b', transition: 'all 0.2s', padding: '0.4rem', borderRadius: '8px' }} title="Копировать">
                              {copiedId === 'ai_' + modalTab + '_' + videoId ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"></polyline></svg> : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>}
                            </button>
                            {/* Refresh button */}
                            <button onClick={() => handleAiAnalyze(modalTab)} disabled={isLoading} style={{ background: 'none', border: 'none', cursor: isLoading ? 'not-allowed' : 'pointer', color: '#64748b', transition: 'all 0.2s', padding: '0.4rem', borderRadius: '8px' }} title="Обновить">
                              <svg style={isLoading ? { animation: 'spin 1s linear infinite' } : {}} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Empty state */}
                      {!result && !error && !isLoading && (
                        <div style={{ background: '#f8fafc', borderRadius: '16px', padding: '2.5rem', textAlign: 'center', border: '1px dashed #cbd5e1', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>{cfg.icon}</div>
                          <p style={{ color: '#64748b', margin: '0 0 1.25rem 0', fontSize: '0.95rem', maxWidth: '340px', lineHeight: '1.5' }}>
                            {cfg.description}
                          </p>
                          <button
                            onClick={() => handleAiAnalyze(modalTab)}
                            style={{
                              padding: '0.85rem 2rem',
                              background: 'linear-gradient(135deg, #312e81, #4f46e5)',
                              color: 'white', border: 'none', borderRadius: '12px', fontWeight: '600', fontSize: '0.95rem',
                              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                              transition: 'all 0.2s', boxShadow: '0 4px 14px rgba(79, 70, 229, 0.3)',
                            }}
                            onMouseOver={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                            onMouseOut={e => e.currentTarget.style.transform = 'translateY(0)'}
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3l1.9 5.8 1.9-5.8a2 2 0 0 1 1.3-1.3l5.8-1.9-5.8-1.9a2 2 0 0 1-1.3-1.3z"></path></svg>
                            {cfg.buttonText}
                          </button>
                        </div>
                      )}

                      {/* Loading state */}
                      {isLoading && (
                        <div style={{ background: '#f8fafc', borderRadius: '16px', padding: '3rem', textAlign: 'center', border: '1px solid #e2e8f0', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                          <svg style={{ animation: 'spin 1.5s linear infinite', marginBottom: '1rem' }} width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3l1.9 5.8 1.9-5.8a2 2 0 0 1 1.3-1.3l5.8-1.9-5.8-1.9a2 2 0 0 1-1.3-1.3z"></path>
                          </svg>
                          <p style={{ color: '#4f46e5', fontWeight: '600', fontSize: '1rem', margin: 0 }}>AI думает...</p>
                          <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: '0.5rem 0 0 0' }}>Обычно это занимает 5-15 секунд</p>
                        </div>
                      )}

                      {/* Error state */}
                      {error && !isLoading && (
                        <div style={{ background: '#fef2f2', color: '#ef4444', padding: '1.5rem', borderRadius: '16px', border: '1px solid #fecaca', marginBottom: '1rem' }}>
                          <b>Ошибка:</b><br />{error}
                          <div style={{ marginTop: '1rem' }}>
                            <button onClick={() => handleAiAnalyze(modalTab)} style={{ padding: '0.5rem 1rem', background: '#ef4444', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '0.85rem' }}>
                              Попробовать снова
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Result state */}
                      {result && !isLoading && (
                        <div style={{ background: '#f8fafc', borderRadius: '16px', padding: '1.5rem', border: '1px solid #e2e8f0', color: '#334155', lineHeight: '1.7', fontSize: '0.95rem', flex: 1, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
                          {result}
                        </div>
                      )}
                    </div>
                  );
                })()}

              </div>
            </div>
          </div>
        </div>
      )}
    </div >
  );
}
