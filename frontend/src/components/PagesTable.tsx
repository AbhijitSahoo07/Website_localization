"use client";

import { useState, useEffect } from "react";
import { Page } from "@/types";
import { updatePageSelection, bulkUpdatePageSelection } from "@/services/api";
import { useCrawlerStore } from "@/store/useCrawlerStore";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, Search, SlidersHorizontal, AlertTriangle, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";

interface PagesTableProps {
    pages: Page[];
    onSelectionChange: () => void;
}

type SortField = "url" | "title" | "http_status" | "word_count" | "page_type" | "translation_status";
type SortOrder = "asc" | "desc";

export default function PagesTable({ pages: initialPages, onSelectionChange }: PagesTableProps) {
    const { setActivePageId } = useCrawlerStore();
    const [pages, setPages] = useState<Page[]>(initialPages);

    useEffect(() => {
        setPages(initialPages);
    }, [initialPages]);

    const [search, setSearch] = useState("");
    const [pageTypeFilter, setPageTypeFilter] = useState("all");
    const [statusFilter, setStatusFilter] = useState("all");
    const [selectionFilter, setSelectionFilter] = useState("all"); // 'all' | 'selected' | 'unselected'
    
    // Selection state loading guard
    const [isUpdatingSelection, setIsUpdatingSelection] = useState(false);

    // Sorting State
    const [sortField, setSortField] = useState<SortField>("url");
    const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    // Toggle single page selection
    const handleToggleSelection = async (pageId: number, currentVal: boolean) => {
        if (isUpdatingSelection) return;
        setIsUpdatingSelection(true);
        const newVal = !currentVal;
        
        // Optimistic UI update
        setPages(prev => prev.map(p => p.id === pageId ? { ...p, is_selected: newVal } : p));
        
        try {
            await updatePageSelection(pageId, newVal);
            onSelectionChange();
        } catch (error) {
            console.error("Failed to update page selection", error);
            // Revert on error
            setPages(prev => prev.map(p => p.id === pageId ? { ...p, is_selected: currentVal } : p));
        } finally {
            setIsUpdatingSelection(false);
        }
    };

    // Toggle all pages selection
    const handleToggleSelectAll = async (checked: boolean) => {
        if (isUpdatingSelection) return;
        const filteredList = getFilteredPages();
        const updatedIds = filteredList.map(p => p.id);
        if (updatedIds.length === 0) return;

        setIsUpdatingSelection(true);
        // Optimistic UI update
        setPages(prev => prev.map(p => updatedIds.includes(p.id) ? { ...p, is_selected: checked } : p));

        try {
            const projectId = filteredList[0].project_id;
            await bulkUpdatePageSelection(projectId, updatedIds, checked);
            onSelectionChange();
        } catch (error) {
            console.error("Failed to update selections", error);
            // Revert on error
            setPages(prev => prev.map(p => updatedIds.includes(p.id) ? { ...p, is_selected: !checked } : p));
        } finally {
            setIsUpdatingSelection(false);
        }
    };


    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortOrder(sortOrder === "asc" ? "desc" : "asc");
        } else {
            setSortField(field);
            setSortOrder("asc");
        }
    };

    // Filter Logic
    const getFilteredPages = () => {
        return pages.filter(p => {
            const matchesSearch = 
                p.url.toLowerCase().includes(search.toLowerCase()) || 
                (p.title || "").toLowerCase().includes(search.toLowerCase());
            
            const matchesType = pageTypeFilter === "all" || p.page_type === pageTypeFilter;
            const matchesStatus = statusFilter === "all" || p.translation_status === statusFilter;
            
            const matchesSelection = 
                selectionFilter === "all" || 
                (selectionFilter === "selected" && p.is_selected) || 
                (selectionFilter === "unselected" && !p.is_selected);

            return matchesSearch && matchesType && matchesStatus && matchesSelection;
        });
    };

    // Sort Logic
    const getSortedPages = (filteredList: Page[]) => {
        return [...filteredList].sort((a, b) => {
            let valA = a[sortField] ?? "";
            let valB = b[sortField] ?? "";

            if (typeof valA === "string" && typeof valB === "string") {
                return sortOrder === "asc" 
                    ? valA.localeCompare(valB) 
                    : valB.localeCompare(valA);
            }
            
            if (typeof valA === "number" && typeof valB === "number") {
                return sortOrder === "asc" ? valA - valB : valB - valA;
            }

            return 0;
        });
    };

    const filteredPages = getFilteredPages();
    const sortedPages = getSortedPages(filteredPages);

    // Pagination Logic
    const totalPages = Math.ceil(sortedPages.length / itemsPerPage);
    const paginatedPages = sortedPages.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    const uniquePageTypes = Array.from(new Set(pages.map(p => p.page_type)));
    const allSelected = filteredPages.length > 0 && filteredPages.every(p => p.is_selected);

    return (
        <div className="space-y-4 text-white">
            {/* Filters Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 p-4 rounded-lg border border-slate-800">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                    <Input
                        placeholder="Search URL or Title..."
                        className="pl-9 bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-500 focus-visible:ring-indigo-500"
                        value={search}
                        onChange={(e) => {
                            setSearch(e.target.value);
                            setCurrentPage(1);
                        }}
                    />
                </div>
                
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                        <SlidersHorizontal className="h-4 w-4 text-slate-400" />
                        <span className="text-xs text-slate-400 font-semibold uppercase">Filters:</span>
                    </div>
                    
                    {/* Page Type Filter */}
                    <select
                        className="bg-slate-800 border border-slate-700 rounded-md px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        value={pageTypeFilter}
                        onChange={(e) => {
                            setPageTypeFilter(e.target.value);
                            setCurrentPage(1);
                        }}
                    >
                        <option value="all">All Types</option>
                        {uniquePageTypes.map(type => (
                            <option key={type} value={type}>{type}</option>
                        ))}
                    </select>

                    {/* Status Filter */}
                    <select
                        className="bg-slate-800 border border-slate-700 rounded-md px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        value={statusFilter}
                        onChange={(e) => {
                            setStatusFilter(e.target.value);
                            setCurrentPage(1);
                        }}
                    >
                        <option value="all">All Statuses</option>
                        <option value="pending">Pending</option>
                        <option value="in_progress">In Progress</option>
                        <option value="completed">Completed</option>
                    </select>

                    {/* Selection Filter */}
                    <select
                        className="bg-slate-800 border border-slate-700 rounded-md px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        value={selectionFilter}
                        onChange={(e) => {
                            setSelectionFilter(e.target.value);
                            setCurrentPage(1);
                        }}
                    >
                        <option value="all">All Selections</option>
                        <option value="selected">Selected</option>
                        <option value="unselected">Excluded</option>
                    </select>
                </div>
            </div>

            {/* Table Container */}
            <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                <Table>
                    <TableHeader className="bg-slate-950/50 border-b border-slate-800">
                        <TableRow>
                            <TableHead className="w-12 text-center">
                                <Checkbox
                                    checked={allSelected}
                                    onCheckedChange={(checked) => handleToggleSelectAll(!!checked)}
                                    disabled={isUpdatingSelection}
                                />
                            </TableHead>
                            <TableHead className="cursor-pointer select-none" onClick={() => handleSort("url")}>
                                <div className="flex items-center gap-2">
                                    URL {sortField === "url" && (sortOrder === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />)}
                                </div>
                            </TableHead>
                            <TableHead className="cursor-pointer select-none" onClick={() => handleSort("title")}>
                                <div className="flex items-center gap-2">
                                    Page Title {sortField === "title" && (sortOrder === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />)}
                                </div>
                            </TableHead>
                            <TableHead className="cursor-pointer select-none text-center" onClick={() => handleSort("http_status")}>
                                <div className="flex items-center justify-center gap-2">
                                    Status {sortField === "http_status" && (sortOrder === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />)}
                                </div>
                            </TableHead>
                            <TableHead className="cursor-pointer select-none text-center" onClick={() => handleSort("word_count")}>
                                <div className="flex items-center justify-center gap-2">
                                    Words {sortField === "word_count" && (sortOrder === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />)}
                                </div>
                            </TableHead>
                            <TableHead className="cursor-pointer select-none text-center" onClick={() => handleSort("page_type")}>
                                <div className="flex items-center justify-center gap-2">
                                    Type {sortField === "page_type" && (sortOrder === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />)}
                                </div>
                            </TableHead>
                            <TableHead className="cursor-pointer select-none text-center" onClick={() => handleSort("translation_status")}>
                                <div className="flex items-center justify-center gap-2">
                                    Translation {sortField === "translation_status" && (sortOrder === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />)}
                                </div>
                            </TableHead>
                            <TableHead>Crawl Issues</TableHead>
                            <TableHead className="text-center">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody className="divide-y divide-slate-800">
                        {paginatedPages.length > 0 ? (
                            paginatedPages.map(page => (
                                <TableRow 
                                    key={page.id} 
                                    className="hover:bg-slate-800/40 border-b border-slate-800 transition-colors"
                                >
                                    <TableCell className="text-center">
                                        <Checkbox
                                            checked={page.is_selected}
                                            onCheckedChange={() => handleToggleSelection(page.id, page.is_selected)}
                                            disabled={isUpdatingSelection}
                                        />
                                    </TableCell>

                                    <TableCell className="font-mono text-xs text-blue-400 hover:underline max-w-xs truncate cursor-pointer" onClick={() => setActivePageId(page.id)}>
                                        {page.url}
                                    </TableCell>
                                    <TableCell className="text-sm font-medium text-slate-200 max-w-xs truncate">
                                        {page.title || <span className="text-slate-500 italic">No Title</span>}
                                    </TableCell>
                                    <TableCell className="text-center text-xs">
                                        <span className={`px-2 py-0.5 rounded font-semibold ${
                                            page.http_status === 200 
                                                ? "bg-green-500/10 text-green-400 border border-green-500/20" 
                                                : "bg-red-500/10 text-red-400 border border-red-500/20"
                                        }`}>
                                            {page.http_status || "ERR"}
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-center text-sm font-medium text-slate-300">
                                        {page.word_count.toLocaleString()}
                                    </TableCell>
                                    <TableCell className="text-center text-xs font-semibold">
                                        <span className="bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded border border-indigo-500/20">
                                            {page.page_type}
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-center text-xs font-semibold capitalize">
                                        <span className={`px-2 py-0.5 rounded border ${
                                            page.translation_status === "completed" 
                                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
                                                : page.translation_status === "in_progress"
                                                ? "bg-sky-500/10 text-sky-400 border-sky-500/20"
                                                : "bg-slate-500/10 text-slate-400 border-slate-500/20"
                                        }`}>
                                            {page.translation_status.replace("_", " ")}
                                        </span>
                                    </TableCell>
                                    <TableCell>
                                        {page.crawl_issues.length > 0 ? (
                                            <div className="flex flex-wrap gap-1">
                                                {page.crawl_issues.map((issue, idx) => (
                                                    <span 
                                                        key={idx} 
                                                        className="inline-flex items-center gap-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded text-[10px] font-semibold"
                                                    >
                                                        <AlertTriangle className="h-3 w-3" />
                                                        {issue}
                                                    </span>
                                                ))}
                                            </div>
                                        ) : (
                                            <span className="text-xs text-slate-500">—</span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setActivePageId(page.id)}
                                            className="h-7 px-3 text-xs font-semibold border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10 transition-colors"
                                        >
                                            Translate
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={8} className="text-center py-8 text-slate-500 font-medium">
                                    No pages found matching filters.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between p-4 bg-slate-950/30 border-t border-slate-800">
                        <div className="text-xs text-slate-400">
                            Showing page <strong className="text-white">{currentPage}</strong> of <strong className="text-white">{totalPages}</strong>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                className="bg-slate-800 hover:bg-slate-700 text-white border-slate-700"
                                disabled={currentPage === 1}
                                onClick={() => setCurrentPage(prev => prev - 1)}
                            >
                                <ChevronLeft className="h-4 w-4 mr-1" /> Prev
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="bg-slate-800 hover:bg-slate-700 text-white border-slate-700"
                                disabled={currentPage === totalPages}
                                onClick={() => setCurrentPage(prev => prev + 1)}
                            >
                                Next <ChevronRight className="h-4 w-4 ml-1" />
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
