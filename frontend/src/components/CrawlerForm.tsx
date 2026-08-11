"use client";

import { useState } from "react";
import { useCrawlerStore } from "@/store/useCrawlerStore";
import { createProject } from "@/services/api";
import { Globe, Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";

const SUPPORTED_LANGUAGES = [
    "Arabic",
    "Bengali",
    "Chinese",
    "Czech",
    "Danish",
    "Dutch",
    "Finnish",
    "French",
    "German",
    "Greek",
    "Hebrew",
    "Hindi",
    "Hungarian",
    "Indonesian",
    "Italian",
    "Japanese",
    "Korean",
    "Malay",
    "Norwegian",
    "Persian",
    "Polish",
    "Portuguese",
    "Romanian",
    "Russian",
    "Spanish",
    "Swedish",
    "Thai",
    "Turkish",
    "Ukrainian",
    "Vietnamese"
];

export default function CrawlerForm() {
    const { setProjectId, startPolling } = useCrawlerStore();
    const [url, setUrl] = useState("");
    const [targetLanguage, setTargetLanguage] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setIsLoading(true);

        try {
            // Basic URL validation
            let parsedUrl;
            try {
                parsedUrl = new URL(url.startsWith("http") ? url : `https://${url}`);
            } catch (err) {
                throw new Error("Invalid URL format");
            }

            const project = await createProject(parsedUrl.href, targetLanguage);
            setProjectId(project.id);
            startPolling();
        } catch (err: any) {
            setError(err.response?.data?.detail || err.message || "Failed to start crawler");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Card className="w-full max-w-lg mx-auto shadow-xl bg-slate-900 border-slate-800 text-white">
            <CardHeader className="space-y-1 text-center">
                <CardTitle className="text-2xl font-bold tracking-tight bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
                    Website Localization
                </CardTitle>
                <CardDescription className="text-slate-400">
                    Enter a website URL and select one of our {SUPPORTED_LANGUAGES.length} supported languages to start.
                </CardDescription>
            </CardHeader>
            <form onSubmit={handleSubmit}>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <label htmlFor="url" className="text-sm font-medium leading-none text-slate-300">
                            Website URL
                        </label>
                        <div className="relative">
                            <Globe className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                            <Input
                                id="url"
                                placeholder="https://example.com"
                                className="pl-9 bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-500"
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                required
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <label htmlFor="language" className="text-sm font-medium leading-none text-slate-300">
                                Target Language
                            </label>
                            <span className="text-[10px] text-indigo-400 font-semibold bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20">
                                {SUPPORTED_LANGUAGES.length} Languages Supported
                            </span>
                        </div>
                        <div className="relative">
                            <Languages className="absolute left-3 top-2.5 h-4 w-4 text-slate-500 z-10" />
                            <select
                                id="language"
                                className="flex h-9 w-full rounded-lg border border-slate-700 bg-slate-800 pl-9 pr-8 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors disabled:cursor-not-allowed disabled:opacity-50 appearance-none"
                                value={targetLanguage}
                                onChange={(e) => setTargetLanguage(e.target.value)}
                                required
                            >
                                <option value="" disabled className="bg-slate-900 text-slate-400">Select target language...</option>
                                {SUPPORTED_LANGUAGES.map((lang) => (
                                    <option key={lang} value={lang} className="bg-slate-900 text-slate-200">
                                        {lang}
                                    </option>
                                ))}
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
                                <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                                    <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
                                </svg>
                            </div>
                        </div>
                    </div>
                    {error && (
                        <div className="text-red-400 text-sm font-medium bg-red-400/10 p-3 rounded-md border border-red-400/20">
                            {error}
                        </div>
                    )}
                </CardContent>
                <CardFooter>
                    <Button 
                        type="submit" 
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white transition-all shadow-lg shadow-indigo-900/20"
                        disabled={isLoading}
                    >
                        {isLoading ? "Starting Crawler..." : "Start Crawling"}
                    </Button>
                </CardFooter>
            </form>
        </Card>
    );
}
