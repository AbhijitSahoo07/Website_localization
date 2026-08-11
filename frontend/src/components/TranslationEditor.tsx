"use client";

import { useState, useEffect } from "react";
import { useCrawlerStore } from "@/store/useCrawlerStore";
import { 
    getPageSegments, 
    extractPageSegments, 
    translatePageSegments, 
    updateSegmentTranslation, 
    approveSegmentTranslation, 
    regenerateSegmentTranslation,
    getPageDetails,
    resetPageSegments
} from "@/services/api";
import { Page, TranslationSegment } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { 
    ArrowLeft, 
    Sparkles, 
    Check, 
    RotateCw, 
    Save, 
    Search, 
    Loader2, 
    AlertTriangle, 
    Globe, 
    Layers,
    Trash2
} from "lucide-react";

export default function TranslationEditor() {
    const { activePageId, setActivePageId, reset } = useCrawlerStore();
    const [page, setPage] = useState<Page | null>(null);
    const [segments, setSegments] = useState<TranslationSegment[]>([]);
    const [loading, setLoading] = useState(true);
    const [isExtracting, setIsExtracting] = useState(false);
    const [isTranslating, setIsTranslating] = useState(false);
    
    // Action loading states
    const [busyIds, setBusyIds] = useState<Record<number, boolean>>({});
    const [isResetting, setIsResetting] = useState(false);

    
    // Edited texts map
    const [editedTexts, setEditedTexts] = useState<Record<number, string>>({});

    // Filters
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");

    useEffect(() => {
        if (activePageId) {
            loadPageAndSegments();
        }
    }, [activePageId]);

    const loadPageAndSegments = async () => {
        if (!activePageId) return;
        setLoading(true);
        try {
            const pageData = await getPageDetails(activePageId);
            setPage(pageData);
            
            const segmentData = await getPageSegments(activePageId);
            setSegments(segmentData);
        } catch (error) {
            console.error("Failed to load segments", error);
            reset();
        } finally {
            setLoading(false);
        }
    };

    const handleExtract = async () => {
        if (!activePageId) return;
        setIsExtracting(true);
        try {
            const segmentData = await extractPageSegments(activePageId);
            setSegments(segmentData);
        } catch (error) {
            console.error("Extraction failed", error);
        } finally {
            setIsExtracting(false);
        }
    };

    const handleTranslateAll = async () => {
        if (!activePageId) return;
        setIsTranslating(true);
        try {
            const segmentData = await translatePageSegments(activePageId);
            setSegments(segmentData);
            // Refresh parent page details (to show updated status)
            const pageData = await getPageDetails(activePageId);
            setPage(pageData);
        } catch (error) {
            console.error("Bulk AI Translation failed", error);
            alert("Translation failed. Check your Gemini API key in the backend .env file.");
        } finally {
            setIsTranslating(false);
        }
    };

    const handleReset = async () => {
        if (!activePageId) return;
        if (!confirm("Reset all translations back to Pending? This clears all translated text.")) return;
        setIsResetting(true);
        try {
            await resetPageSegments(activePageId);
            // Refresh segments
            const segmentData = await getPageSegments(activePageId);
            setSegments(segmentData);
        } catch (error) {
            console.error("Reset failed", error);
        } finally {
            setIsResetting(false);
        }
    };

    const handleSave = async (segId: number) => {
        const text = editedTexts[segId];
        if (text === undefined) return;
        
        setBusyIds(prev => ({ ...prev, [segId]: true }));
        try {
            const updated = await updateSegmentTranslation(segId, text);
            setSegments(prev => prev.map(s => s.id === segId ? updated : s));
            // Remove from edited state to reset save button
            setEditedTexts(prev => {
                const copy = { ...prev };
                delete copy[segId];
                return copy;
            });
        } catch (error) {
            console.error("Failed to save translation", error);
        } finally {
            setBusyIds(prev => ({ ...prev, [segId]: false }));
        }
    };

    const handleApprove = async (segId: number) => {
        setBusyIds(prev => ({ ...prev, [segId]: true }));
        try {
            const updated = await approveSegmentTranslation(segId);
            setSegments(prev => prev.map(s => s.id === segId ? updated : s));
        } catch (error) {
            console.error("Approval failed", error);
        } finally {
            setBusyIds(prev => ({ ...prev, [segId]: false }));
        }
    };

    const handleRegenerate = async (segId: number) => {
        setBusyIds(prev => ({ ...prev, [segId]: true }));
        try {
            const updated = await regenerateSegmentTranslation(segId);
            setSegments(prev => prev.map(s => s.id === segId ? updated : s));
            // Reset text input value to new AI response
            setEditedTexts(prev => {
                const copy = { ...prev };
                delete copy[segId];
                return copy;
            });
        } catch (error) {
            console.error("Regeneration failed", error);
        } finally {
            setBusyIds(prev => ({ ...prev, [segId]: false }));
        }
    };

    const filteredSegments = segments.filter(seg => {
        const matchesSearch = 
            seg.source_text.toLowerCase().includes(search.toLowerCase()) || 
            (seg.translated_text || "").toLowerCase().includes(search.toLowerCase());
            
        const matchesStatus = 
            statusFilter === "all" || 
            seg.status.toLowerCase() === statusFilter.toLowerCase();
            
        return matchesSearch && matchesStatus;
    });

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] gap-3 text-slate-400">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
                <p className="text-sm font-medium">Loading translatable segments...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 w-full max-w-7xl mx-auto">
            {/* Header section */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900 border border-slate-800 p-6 rounded-xl shadow-lg">
                <div className="space-y-2">
                    <Button 
                        variant="ghost" 
                        onClick={() => setActivePageId(null)}
                        className="flex items-center gap-2 -ml-3 text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 h-8 text-xs font-semibold"
                    >
                        <ArrowLeft className="h-4 w-4" /> Back to Dashboard
                    </Button>
                    <div className="flex items-center gap-2">
                        <Globe className="h-5 w-5 text-indigo-400" />
                        <h2 className="text-xl font-bold text-slate-100 tracking-tight">Translation Editor</h2>
                    </div>
                    {page && (
                        <div className="space-y-1">
                            <p className="text-xs text-slate-500 font-mono break-all">{page.url}</p>
                            <p className="text-sm font-semibold text-slate-300">
                                {page.title || <span className="italic text-slate-500">No Title</span>}
                            </p>
                        </div>
                    )}
                </div>

                <div className="flex gap-2">
                    {segments.length > 0 && (
                        <Button 
                            onClick={handleReset}
                            disabled={isResetting}
                            variant="outline"
                            className="border-red-800 text-red-400 hover:bg-red-900/20 font-semibold flex items-center gap-2"
                        >
                            {isResetting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                            Reset
                        </Button>
                    )}
                    <Button 
                        onClick={handleExtract}
                        disabled={isExtracting}
                        variant="outline"
                        className="border-slate-700 text-slate-300 hover:bg-slate-800 font-semibold flex items-center gap-2"
                    >
                        {isExtracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Layers className="h-4 w-4" />}
                        {isExtracting ? 'Extracting...' : 'Re-Extract'}
                    </Button>
                    <Button 
                        onClick={handleTranslateAll}
                        disabled={isTranslating || segments.filter(s => s.status === 'Pending').length === 0}
                        className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-semibold flex items-center gap-2 shadow-lg shadow-indigo-600/20"
                    >
                        {isTranslating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        {isTranslating 
                            ? 'Translating...' 
                            : `Translate ${segments.filter(s => s.status === 'Pending').length} Pending`
                        }
                    </Button>
                </div>
            </div>

            {/* Empty state when no segments extracted */}
            {!loading && segments.length === 0 && (
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center max-w-xl mx-auto space-y-4">
                    <div className="mx-auto w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center">
                        <AlertTriangle className="h-6 w-6 text-indigo-400" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-200">No text segments extracted</h3>
                    <p className="text-slate-400 text-sm">
                        Before we can translate this page, we need to parse and extract the translatable text blocks (headings, paragraphs, buttons, etc.).
                    </p>
                    <Button 
                        onClick={handleExtract}
                        disabled={isExtracting}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold flex items-center gap-2 mx-auto"
                    >
                        {isExtracting && <Loader2 className="h-4 w-4 animate-spin" />}
                        Extract Text Segments
                    </Button>
                </div>
            )}

            {/* Table layout when segments are present */}
            {segments.length > 0 && (
                <div className="space-y-4">
                    {/* Controls Bar */}
                    <div className="flex flex-col md:flex-row justify-between gap-3 bg-slate-900 border border-slate-800 p-4 rounded-lg">
                        <div className="relative flex-1 max-w-md">
                            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                            <Input
                                placeholder="Search original or translated text..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="pl-9 bg-slate-950 border-slate-800 text-slate-200 placeholder-slate-500 focus-visible:ring-indigo-500"
                            />
                        </div>
                        <select
                            className="bg-slate-950 border border-slate-800 rounded-md px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                        >
                            <option value="all">All Statuses</option>
                            <option value="pending">Pending</option>
                            <option value="machine translated">Machine Translated</option>
                            <option value="edited">Edited</option>
                            <option value="approved">Approved</option>
                        </select>
                    </div>

                    {/* Table View */}
                    <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                        <Table>
                            <TableHeader className="bg-slate-950/50 border-b border-slate-800">
                                <TableRow>
                                    <TableHead className="w-[45%]">Original Text</TableHead>
                                    <TableHead className="w-[45%]">Translated Text</TableHead>
                                    <TableHead className="text-center w-24">Status</TableHead>
                                    <TableHead className="text-right w-36">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody className="divide-y divide-slate-800">
                                {filteredSegments.length > 0 ? (
                                    filteredSegments.map(seg => {
                                        const isBusy = !!busyIds[seg.id];
                                        const currentVal = editedTexts[seg.id] !== undefined ? editedTexts[seg.id] : (seg.translated_text || "");
                                        const isChanged = editedTexts[seg.id] !== undefined && editedTexts[seg.id] !== (seg.translated_text || "");

                                        return (
                                            <TableRow key={seg.id} className="hover:bg-slate-800/30 border-b border-slate-800 transition-colors">
                                                <TableCell className="text-sm text-slate-300 font-medium align-top leading-relaxed py-4 whitespace-pre-wrap">
                                                    {seg.source_text}
                                                    {seg.selector && (
                                                        <span className="block mt-1.5 text-[10px] font-mono text-slate-500 uppercase tracking-wider">
                                                            {seg.selector}
                                                        </span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="align-top py-4">
                                                    <textarea
                                                        className="bg-slate-950 border border-slate-800 rounded-md p-2 w-full text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-sm resize-y min-h-[60px] leading-relaxed"
                                                        value={currentVal}
                                                        onChange={(e) => setEditedTexts(prev => ({ ...prev, [seg.id]: e.target.value }))}
                                                        placeholder="No translation yet..."
                                                        disabled={isBusy}
                                                    />
                                                </TableCell>
                                                <TableCell className="text-center align-top py-5">
                                                    <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold tracking-wider uppercase border ${
                                                        seg.status === "Approved"
                                                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                                            : seg.status === "Edited"
                                                            ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                                            : seg.status === "Machine Translated"
                                                            ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
                                                            : "bg-slate-500/10 text-slate-400 border-slate-500/20"
                                                    }`}>
                                                        {seg.status}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="text-right align-top py-4">
                                                    <div className="flex justify-end gap-1.5">
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            disabled={isBusy || !isChanged}
                                                            onClick={() => handleSave(seg.id)}
                                                            className="h-8 px-2 border-indigo-500/20 text-indigo-400 hover:bg-indigo-500/10"
                                                            title="Save manual changes"
                                                        >
                                                            {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                                        </Button>
                                                        
                                                        {seg.status !== "Approved" && seg.translated_text && (
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                disabled={isBusy}
                                                                onClick={() => handleApprove(seg.id)}
                                                                className="h-8 px-2 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10"
                                                                title="Approve translation"
                                                            >
                                                                <Check className="h-4 w-4" />
                                                            </Button>
                                                        )}
                                                        
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            disabled={isBusy}
                                                            onClick={() => handleRegenerate(seg.id)}
                                                            className="h-8 px-2 border-slate-700 text-slate-400 hover:bg-slate-800"
                                                            title="Regenerate with AI"
                                                        >
                                                            <RotateCw className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={4} className="text-center py-8 text-slate-500 font-medium">
                                            No segments match your filters.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            )}
        </div>
    );
}
