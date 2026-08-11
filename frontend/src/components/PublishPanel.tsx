"use client";

import { useState, useEffect, useCallback } from "react";
import { useCrawlerStore } from "@/store/useCrawlerStore";
import {
    getPublishStatus,
    getPublishVersions,
    publishProject,
    republishProject,
    getScriptSnippet,
} from "@/services/api";
import { PublishStatus, PublishVersion } from "@/types";
import { Button } from "@/components/ui/button";
import {
    ArrowLeft,
    Globe,
    Rocket,
    RefreshCw,
    Copy,
    CheckCircle2,
    XCircle,
    Clock,
    Code2,
    History,
    Loader2,
    AlertTriangle,
    Check,
} from "lucide-react";

const LANG_TO_CODE: { [key: string]: string } = {
    "spanish": "es",
    "french": "fr",
    "german": "de",
    "portuguese": "pt",
    "italian": "it",
    "dutch": "nl",
    "russian": "ru",
    "chinese": "zh",
    "japanese": "ja",
    "korean": "ko",
    "arabic": "ar",
    "hindi": "hi",
    "turkish": "tr",
    "polish": "pl",
    "swedish": "sv",
    "danish": "da",
    "finnish": "fi",
    "norwegian": "no",
    "czech": "cs",
    "romanian": "ro",
    "hungarian": "hu",
    "ukrainian": "uk",
    "vietnamese": "vi",
    "thai": "th",
    "indonesian": "id",
    "malay": "ms",
    "greek": "el",
    "hebrew": "he",
    "persian": "fa",
    "bengali": "bn"
};

export default function PublishPanel() {
    const { projectId, setView } = useCrawlerStore();
    const [status, setStatus] = useState<PublishStatus | null>(null);
    const [versions, setVersions] = useState<PublishVersion[]>([]);
    const [snippet, setSnippet] = useState<string>("");
    const [loading, setLoading] = useState(true);
    const [isPublishing, setIsPublishing] = useState(false);
    const [copied, setCopied] = useState(false);
    const [testCopied, setTestCopied] = useState(false);
    const [targetLanguage, setTargetLanguage] = useState<string>("");
    const [testSnippet, setTestSnippet] = useState<string>("");
    const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

    const showToast = (type: "success" | "error", msg: string) => {
        setToast({ type, msg });
        setTimeout(() => setToast(null), 4000);
    };

    const loadData = useCallback(async () => {
        if (!projectId) return;
        try {
            const [s, v, sc] = await Promise.all([
                getPublishStatus(projectId),
                getPublishVersions(projectId),
                getScriptSnippet(projectId),
            ]);
            setStatus(s);
            setVersions(v || []);
            setSnippet(sc.snippet);

            // Dynamically resolve target language and test snippet
            if (typeof window !== "undefined") {
                const localProjects = JSON.parse(localStorage.getItem("db_projects") || "[]");
                const currentProject = localProjects.find((p: any) => p.id === projectId);
                if (currentProject) {
                    const lang = currentProject.target_language;
                    setTargetLanguage(lang);

                    const langLower = (lang || "").toLowerCase().trim();
                    const code = LANG_TO_CODE[langLower] || "es";
                    const ts = `<!-- Override browser language to ${lang} for local testing -->\n<script>\n    Object.defineProperty(navigator, 'language', {\n        value: '${code}',\n        configurable: true\n    });\n</script>`;
                    setTestSnippet(ts);
                }
            }
        } catch (e) {
            console.error("Failed to load publish data", e);
        } finally {
            setLoading(false);
        }
    }, [projectId]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handlePublish = async () => {
        if (!projectId) return;
        setIsPublishing(true);
        try {
            await publishProject(projectId);
            showToast("success", "Published successfully!");
            await loadData();
        } catch (e: any) {
            const msg = e?.response?.data?.message || "Publish failed. Make sure segments are Approved.";
            showToast("error", msg);
        } finally {
            setIsPublishing(false);
        }
    };

    const handleRepublish = async () => {
        if (!projectId) return;
        setIsPublishing(true);
        try {
            await republishProject(projectId);
            showToast("success", "Republished successfully! Version updated.");
            await loadData();
        } catch (e: any) {
            const msg = e?.response?.data?.message || "Republish failed.";
            showToast("error", msg);
        } finally {
            setIsPublishing(false);
        }
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(snippet).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
        });
    };

    const handleCopyTest = () => {
        navigator.clipboard.writeText(testSnippet).then(() => {
            setTestCopied(true);
            setTimeout(() => setTestCopied(false), 2500);
        });
    };

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return "—";
        return new Date(dateStr).toLocaleString();
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] gap-3 text-slate-400">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
                <p className="text-sm font-medium">Loading publish status...</p>
            </div>
        );
    }

    const canPublish = (status?.total_approved ?? 0) > 0;
    const isPublished = status?.is_published ?? false;
    const approvedPercent = status
        ? Math.round((status.total_approved / Math.max(status.total_segments, 1)) * 100)
        : 0;

    return (
        <div className="space-y-6 w-full max-w-5xl mx-auto">
            {/* Toast Notification */}
            {toast && (
                <div
                    className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-5 py-3 rounded-xl shadow-2xl text-sm font-semibold transition-all duration-300 ${
                        toast.type === "success"
                            ? "bg-emerald-600 text-white"
                            : "bg-red-700 text-white"
                    }`}
                >
                    {toast.type === "success" ? (
                        <CheckCircle2 className="h-5 w-5" />
                    ) : (
                        <XCircle className="h-5 w-5" />
                    )}
                    {toast.msg}
                </div>
            )}

            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900 border border-slate-800 p-6 rounded-xl shadow-lg">
                <div className="space-y-2">
                    <Button
                        variant="ghost"
                        onClick={() => setView("dashboard")}
                        className="flex items-center gap-2 -ml-3 text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 h-8 text-xs font-semibold"
                    >
                        <ArrowLeft className="h-4 w-4" /> Back to Dashboard
                    </Button>
                    <div className="flex items-center gap-2">
                        <Globe className="h-5 w-5 text-indigo-400" />
                        <h2 className="text-xl font-bold text-slate-100 tracking-tight">Publish & Runtime</h2>
                    </div>
                    <p className="text-xs text-slate-500">
                        Publish approved translations and embed your localization snippet.
                    </p>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 flex-wrap">
                    {!isPublished ? (
                        <Button
                            onClick={handlePublish}
                            disabled={isPublishing || !canPublish}
                            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-semibold flex items-center gap-2 shadow-lg shadow-indigo-600/20"
                        >
                            {isPublishing ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <Rocket className="h-4 w-4" />
                            )}
                            {isPublishing ? "Publishing..." : "Publish Now"}
                        </Button>
                    ) : (
                        <Button
                            onClick={handleRepublish}
                            disabled={isPublishing || !canPublish}
                            className="bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white font-semibold flex items-center gap-2 shadow-lg"
                        >
                            {isPublishing ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <RefreshCw className="h-4 w-4" />
                            )}
                            {isPublishing ? "Republishing..." : "Republish"}
                        </Button>
                    )}
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {/* Publish Status */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1">
                    <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Status</p>
                    <div className="flex items-center gap-2 mt-1">
                        {isPublished ? (
                            <>
                                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                                <span className="text-emerald-400 font-bold text-sm">Live</span>
                            </>
                        ) : (
                            <>
                                <span className="h-2 w-2 rounded-full bg-slate-600" />
                                <span className="text-slate-500 font-bold text-sm">Not Published</span>
                            </>
                        )}
                    </div>
                </div>

                {/* Version */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1">
                    <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Version</p>
                    <p className="text-2xl font-bold text-slate-100 mt-1">
                        {status?.current_version ? `v${status.current_version}` : "—"}
                    </p>
                </div>

                {/* Approved */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1">
                    <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Approved</p>
                    <p className="text-2xl font-bold text-emerald-400 mt-1">
                        {status?.total_approved ?? 0}
                        <span className="text-slate-500 text-sm font-medium ml-1">
                            / {status?.total_segments ?? 0}
                        </span>
                    </p>
                </div>

                {/* Last Published */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1">
                    <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Last Published</p>
                    <p className="text-xs font-semibold text-slate-300 mt-2 leading-relaxed">
                        {formatDate(status?.published_at || null)}
                    </p>
                </div>
            </div>

            {/* Approval Progress */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
                <div className="flex justify-between items-center">
                    <p className="text-sm font-semibold text-slate-300">Translation Approval Progress</p>
                    <span className="text-xs text-slate-500">{approvedPercent}% approved</span>
                </div>
                <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div
                        className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all duration-700"
                        style={{ width: `${approvedPercent}%` }}
                    />
                </div>
                {!canPublish && (
                    <div className="flex items-center gap-2 text-amber-400 text-xs">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        <span>At least one segment must be Approved before publishing. Go to the Translation Editor to approve segments.</span>
                    </div>
                )}
            </div>

            {/* Script Snippet */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
                <div className="flex items-center gap-2">
                    <Code2 className="h-4 w-4 text-indigo-400" />
                    <p className="text-sm font-bold text-slate-200">Embed Script</p>
                    <span className="ml-auto">
                        <Button
                            onClick={handleCopy}
                            variant="outline"
                            size="sm"
                            className="border-slate-700 text-slate-300 hover:bg-slate-800 h-7 text-xs flex items-center gap-1.5"
                        >
                            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                            {copied ? "Copied!" : "Copy"}
                        </Button>
                    </span>
                </div>
                <div className="relative">
                    <pre className="bg-slate-950 border border-slate-800 rounded-lg p-4 text-xs text-emerald-300 font-mono overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
                        {snippet || `<script src="http://localhost:8000/runtime/loc.js" data-project="${projectId}" async></script>`}
                    </pre>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                    Paste this snippet once into your website's{" "}
                    <code className="text-slate-400 bg-slate-800 px-1 py-0.5 rounded text-[11px]">&lt;head&gt;</code>{" "}
                    or before the closing{" "}
                    <code className="text-slate-400 bg-slate-800 px-1 py-0.5 rounded text-[11px]">&lt;/body&gt;</code> tag.
                    Translations update automatically when you republish — no snippet changes needed.
                </p>
            </div>

            {/* Testing Helper Snippet */}
            {testSnippet && (
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
                    <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4 text-indigo-400" />
                        <p className="text-sm font-bold text-slate-200">Testing Override Snippet</p>
                        <span className="ml-auto">
                            <Button
                                onClick={handleCopyTest}
                                variant="outline"
                                size="sm"
                                className="border-slate-700 text-slate-300 hover:bg-slate-800 h-7 text-xs flex items-center gap-1.5"
                            >
                                {testCopied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                                {testCopied ? "Copied!" : "Copy"}
                            </Button>
                        </span>
                    </div>
                    <div className="relative">
                        <pre className="bg-slate-950 border border-slate-800 rounded-lg p-4 text-xs text-indigo-300 font-mono overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
                            {testSnippet}
                        </pre>
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">
                        To test translations on a page in your local browser (if it is not set to {targetLanguage}), paste this override helper snippet <strong>before</strong> the embed script tag.
                    </p>
                </div>
            )}

            {/* Publish History */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-800">
                    <History className="h-4 w-4 text-indigo-400" />
                    <p className="text-sm font-bold text-slate-200">Publish History</p>
                    <span className="ml-auto text-xs text-slate-500">{versions.length} version{versions.length !== 1 ? "s" : ""}</span>
                </div>
                {versions.length === 0 ? (
                    <div className="py-10 text-center text-slate-500 text-sm">
                        <Clock className="h-6 w-6 mx-auto mb-2 opacity-40" />
                        No publish history yet.
                    </div>
                ) : (
                    <div className="divide-y divide-slate-800">
                        {versions.map((v) => (
                            <div
                                key={v.id}
                                className="flex items-center justify-between px-5 py-3 hover:bg-slate-800/30 transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="h-7 w-7 rounded-full bg-indigo-900/50 border border-indigo-700/50 flex items-center justify-center">
                                        <span className="text-[10px] font-bold text-indigo-300">v{v.version}</span>
                                    </div>
                                    <div>
                                        <p className="text-xs font-semibold text-slate-300">Version {v.version}</p>
                                        <p className="text-[11px] text-slate-500">{v.total_segments} approved segments</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <span className="text-[11px] text-slate-500">{formatDate(v.published_at)}</span>
                                    {v.version === status?.current_version && (
                                        <div className="flex items-center justify-end gap-1 mt-0.5">
                                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                                            <span className="text-[10px] text-emerald-400 font-semibold">Current</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
