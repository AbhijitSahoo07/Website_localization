"use client";

import { useEffect, useState } from "react";
import { getProjectPages, getProjectSummary } from "@/services/api";
import { Page, ProjectSummary } from "@/types";
import SummaryCards from "./SummaryCards";
import PagesTable from "./PagesTable";
import { Loader2, RefreshCw, ArrowLeft, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCrawlerStore } from "@/store/useCrawlerStore";

interface DashboardProps {
    projectId: number;
}

export default function Dashboard({ projectId }: DashboardProps) {
    const { reset, setView } = useCrawlerStore();
    const [pages, setPages] = useState<Page[]>([]);
    const [summary, setSummary] = useState<ProjectSummary | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState("");

    const fetchData = async () => {
        setIsLoading(true);
        setError("");
        try {
            const [pagesData, summaryData] = await Promise.all([
                getProjectPages(projectId),
                getProjectSummary(projectId),
            ]);
            setPages(pagesData);
            setSummary(summaryData);
        } catch (err: any) {
            setError(err.message || "Failed to load project details");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [projectId]);

    const handleSelectionChange = () => {
        // Refetch summary since selection changes count towards summary statistics
        getProjectSummary(projectId).then(setSummary).catch(console.error);
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center p-12 space-y-4">
                <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
                <span className="text-sm font-semibold text-slate-400">Loading analysis data...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center p-12 space-y-4 text-center">
                <div className="text-red-400 text-sm font-medium bg-red-400/10 p-4 rounded-lg border border-red-400/20 max-w-md">
                    {error}
                </div>
                <Button onClick={fetchData} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                    Retry
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-8 w-full max-w-7xl mx-auto px-4 py-8 text-white">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-5">
                <div className="flex items-center gap-4">
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={reset}
                        className="text-slate-400 hover:text-white hover:bg-slate-800"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
                            Project Dashboard
                        </h1>
                        <p className="text-slate-400 text-sm mt-1">
                            Analyze project pages and select pages for translation.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Button 
                        onClick={() => setView('publish')} 
                        className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold flex items-center gap-2 shadow-lg shadow-indigo-600/20"
                    >
                        <Rocket className="h-4 w-4" />
                        Publish
                    </Button>
                    <Button 
                        onClick={fetchData} 
                        variant="outline"
                        className="bg-slate-900 border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800"
                    >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Refresh
                    </Button>
                </div>
            </div>

            {/* Summary cards */}
            {summary && <SummaryCards summary={summary} />}

            {/* Pages Table */}
            <div>
                <h2 className="text-xl font-bold mb-4 text-slate-200">Page Catalog</h2>
                <PagesTable pages={pages} onSelectionChange={handleSelectionChange} />
            </div>
        </div>
    );
}
