'use client';

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppContext } from "@/contexts/PersonalizedLearningContext";
import { addStoriesChat, generateModule, generateModules, pageTransition, pageVariants, resetContext, validateJSON } from "@/lib/personalized-learning/utilFunctions";
import { Button } from "@/components/ui/button";
import Typed from "typed.js";
import { AnimatePresence, motion } from "framer-motion";
import prompts from "@/lib/personalized-learning/prompts";
import interactionGemini from "@/lib/personalized-learning/geminiClient";
import { Award, ArrowLeft, ArrowRight, Loader2, Copy, SendToBack, BoxSelect as SelectAll, MessageSquare, Expand, Volume2, Headphones, Play, Pause, VolumeX, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/SupabaseAuthProvider";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm'; 
import { ChevronDown } from 'lucide-react';

interface ExpandedContent {
  originalText: string;
  expandedText: string | null;
  isLoading: boolean;
  id: string; // Unique ID for rendering
}

const StudyPlatformLoading = () => {
    const studyPlatformLoadingEl = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const typed = new Typed(studyPlatformLoadingEl.current, {
            strings: ['Fetching information...', 'Processing data...', 'Loading content...', 'Just a moment...'],
            typeSpeed: 50,
            showCursor: false,
            loop: true,
            backSpeed: 50,
        });

        return () => {
            typed.destroy();
        };
    }, []);

    return (
        <div className="flex flex-col items-center justify-center gap-4 w-full h-full">
            <Loader2 className="h-12 w-12 text-primary animate-spin" />
            <div ref={studyPlatformLoadingEl} className="text-lg text-primary font-medium text-center min-h-[24px]" />
        </div>
    );
};

const StudyPlatformInitial = ({ handleGetModule }: { handleGetModule: () => Promise<void> }) => {
    const { setStudyPlatform } = useAppContext();

    return (
        <div className="flex flex-col items-center justify-center gap-6 w-full min-h-[400px] py-8">
            <Award className="h-24 w-24 text-primary" />
            <h2 className="text-4xl text-primary font-semibold text-center">Ready to Start</h2>

            <div className="text-lg text-muted-foreground text-center max-w-xl">
                Let's begin! Click the button below to access the first module of your personalized learning journey.
            </div>

            <Button
                variant="default"
                size="lg" 
                className="mt-4"
                onClick={() => {
                    handleGetModule();
                    setStudyPlatform(prevState => ({
                        ...prevState,
                        isGettingModels: false,
                        isGettingModulo: true,
                        isLoading: true,
                    }));
                }}
            >
                Start Learning
            </Button>
        </div>
    );
};

const StudyPlatform = () => {
    const { introduction, setIntroduction, personality, studyMaterial, generationHistory, setGenerationHistory, studyPlatform, setStudyPlatform, currentSessionId, setCurrentSessionId } = useAppContext();
    const { user } = useAuth();
    const { toast } = useToast();
    const navigate = useNavigate();
    const contentRef = useRef<HTMLDivElement>(null);
    const [selectedText, setSelectedText] = useState<string>("");
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [activeModuleId, setActiveModuleId] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement>(null);
    const [modulo, setModulo] = useState<number>(studyPlatform.actModule);
    const [actualModuleRes, setActualModuleRes] = useState<string>("");
    const [timeModule, setTimeModule] = useState<boolean>(false);
    const [expansions, setExpansions] = useState<ExpandedContent[]>([]); // New state for expanded content

    const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

    const handleSelection = () => {
        const selection = window.getSelection();
        if (selection && selection.toString()) {
            setSelectedText(selection.toString());
        }
    };

    const handleCopyText = () => {
        if (selectedText) {
            navigator.clipboard.writeText(selectedText);
            toast({
                title: "Copied to clipboard",
                description: "Selected text has been copied",
            });
        }
    };

    const handleSelectAll = () => {
        if (contentRef.current) {
            const range = document.createRange();
            range.selectNodeContents(contentRef.current);
            const selection = window.getSelection();
            if (selection) {
                selection.removeAllRanges();
                selection.addRange(range);
                setSelectedText(selection.toString());
            }
        }
    };

    const handleSendToConvoAI = () => {
        if (selectedText) {
            localStorage.setItem("convoAiContext", selectedText);
            toast({
                title: "Text sent to Convo AI",
                description: "Navigating to Convo AI page...",
            });
            navigate("/dashboard/convo-ai");
        }
    };

    const handleExpandText = async () => {
        if (!selectedText) return;

        const newExpansionId = `exp-${Date.now()}`;
        setExpansions(prev => [...prev, { id: newExpansionId, originalText: selectedText, expandedText: null, isLoading: true }]);

        try {
            const { data, error } = await supabase.functions.invoke('expand-content', {
                body: { textToExpand: selectedText },
            });

            if (error) throw error;
            if (!data || !data.expandedText) throw new Error("No expanded text received.");

            setExpansions(prev => prev.map(exp => 
                exp.id === newExpansionId ? { ...exp, expandedText: data.expandedText, isLoading: false } : exp
            ));
            toast({
                title: "Text Expanded",
                description: "Detailed explanation generated.",
            });
        } catch (error) {
            console.error("Error expanding text:", error);
            setExpansions(prev => prev.map(exp => 
                exp.id === newExpansionId ? { ...exp, expandedText: "Failed to expand text.", isLoading: false } : exp
            ));
            toast({
                title: "Expansion Failed",
                description: error instanceof Error ? error.message : "An unexpected error occurred.",
                variant: "destructive",
            });
        } finally {
            setSelectedText(""); // Clear selection after action
        }
    };

    const handleMuteToggle = () => {
        if (!audioRef.current) return;
        
        audioRef.current.muted = !audioRef.current.muted;
        setIsMuted(audioRef.current.muted);
    };

    // Force sync module audio URL with database
    const syncAudioWithDatabase = async (moduleIndex: number, audioUrl: string) => {
        if (!user?.id || !currentSessionId) return;
        
        try {
            console.log(`Syncing audio URL for module ${moduleIndex} to database...`);
            
            // First get the current state from the database to avoid race conditions
            const { data: currentSession, error: fetchError } = await supabase
                .from('personalized_learning_sessions')
                .select('modules_data')
                .eq('id', currentSessionId)
                .single();
            
            if (fetchError) {
                throw fetchError;
            }
            
            if (!currentSession || !currentSession.modules_data) {
                throw new Error('Session data not found');
            }
            
            // Make a deep copy of the modules data
            const updatedModules = JSON.parse(JSON.stringify(currentSession.modules_data));
            
            // Ensure the module exists and update its audioUrl
            if (updatedModules[moduleIndex]) {
                updatedModules[moduleIndex].audioUrl = audioUrl;
                
                // Update the database with the modified modules data
                const { error: updateError } = await supabase
                    .from('personalized_learning_sessions')
                    .update({ modules_data: updatedModules })
                    .eq('id', currentSessionId);
                
                if (updateError) {
                    throw updateError;
                }
                
                console.log(`Successfully synced audio URL for module ${moduleIndex}`);
                
                // Update local state with the new modules data
                setStudyPlatform(prev => ({
                    ...prev,
                    modulos: updatedModules
                }));
            }
        } catch (error) {
            console.error('Error syncing audio URL with database:', error);
            toast({
                title: "Sync Error",
                description: "Failed to sync audio with database. Refresh may be needed to persist audio.",
                variant: "destructive"
            });
        }
    };

    // Extract plain text from HTML content
    const extractPlainText = (html: string): string => {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        return tempDiv.textContent || tempDiv.innerText || "";
    };

    // Generate audio from current module content
    const handleGenerateAudio = async () => {
        if (!studyPlatform.modulos[studyPlatform.actModule]?.content?.length) {
            toast({
                title: "No content",
                description: "No content available to convert to audio",
                variant: "destructive"
            });
            return;
        }

        setIsGeneratingAudio(true);
        
        try {
            // Extract text from current module
            const allHtmlContent = studyPlatform.modulos[studyPlatform.actModule].content
                .map(item => extractPlainText(item.html))
                .join(" ");
            
            // Limit text length to avoid very large audio files
            const maxTextLength = 5000;
            const trimmedContent = allHtmlContent.length > maxTextLength 
                ? allHtmlContent.substring(0, maxTextLength) + "... (content trimmed for audio)"
                : allHtmlContent;

            // Call Supabase Edge Function for ElevenLabs TTS
            const response = await supabase.functions.invoke('elevenlabs-tts', {
                body: {
                    text: trimmedContent,
                    voiceId: 'EXAVITQu4vr4xnSDxMaL', // Bella voice
                },
            });

            if (response.error) throw new Error(response.error.message);
            
            // Convert response data to a blob and create URL
            // Ensure we have valid audio data
            if (!response.data) {
                throw new Error('No audio data received from ElevenLabs');
            }
            
            // Convert the response data to ArrayBuffer if it isn't already
            let audioArrayBuffer: ArrayBuffer;
            if (response.data instanceof ArrayBuffer) {
                audioArrayBuffer = response.data;
            } else if (response.data instanceof Uint8Array) {
                audioArrayBuffer = response.data.buffer;
            } else {
                // If it's a string or other format, convert it
                const uint8Array = new Uint8Array(response.data);
                audioArrayBuffer = uint8Array.buffer;
            }
            
            // Create blob from ArrayBuffer
            const audioBlob = new Blob([audioArrayBuffer], { type: 'audio/mpeg' });
            const blobUrl = URL.createObjectURL(audioBlob);
            
            // Set module ID to track which module this audio belongs to
            const moduleId = `module-${studyPlatform.actModule}`;
            setActiveModuleId(moduleId);
            
            // If user is authenticated, store in Supabase
            if (user?.id) {
                try {
                    // Create a file name using the topic and module number
                    const sanitizedTopic = studyMaterial.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                    const fileName = `${sanitizedTopic}-module-${studyPlatform.actModule}.mp3`;
                    
                    // Upload to Supabase Storage
                    const { data: storageData, error: storageError } = await supabase.storage
                        .from('learning_audio')
                        .upload(`${user.id}/${fileName}`, audioBlob, {
                            contentType: 'audio/mpeg',
                            upsert: true
                        });
                    
                    if (storageError) {
                        console.error('Error storing audio:', storageError);
                        throw new Error(storageError.message);
                    }
                    
                    // Get public URL
                    const { data: publicUrlData } = supabase.storage
                        .from('learning_audio')
                        .getPublicUrl(`${user.id}/${fileName}`);
                    
                    // Store the public URL
                    if (publicUrlData) {
                        setAudioUrl(publicUrlData.publicUrl);
                        
                        // Revoke the temporary blob URL to free memory
                        if (blobUrl) URL.revokeObjectURL(blobUrl);
                        
                        // Update module data with audio URL
                        const updatedModulos = [...studyPlatform.modulos];
                        updatedModulos[studyPlatform.actModule].audioUrl = publicUrlData.publicUrl;
                        
                        // Update local state first for immediate feedback
                        setStudyPlatform(prev => ({
                            ...prev,
                            modulos: updatedModulos
                        }));
                        
                        // Then sync with database
                        syncAudioWithDatabase(studyPlatform.actModule, publicUrlData.publicUrl);
                    } else {
                        // If we can't get the public URL, fallback to the blob URL
                        setAudioUrl(blobUrl);
                    }
                } catch (error) {
                    console.error('Storage error:', error);
                    // Fallback to using the blob URL directly if storage fails
                    setAudioUrl(blobUrl);
                    toast({
                        title: "Storage Error",
                        description: "Audio generated but couldn't be stored. It will be available for this session only.",
                        variant: "destructive"
                    });
                }
            } else {
                // If not authenticated, just use the blob URL
                setAudioUrl(blobUrl);
            }
            
            toast({
                title: "Audio Generated",
                description: "Your content has been converted to audio!",
            });
        } catch (error) {
            console.error('Error generating audio:', error);
            
            // Enhanced error handling for different types of errors from Edge Function
            let errorMessage = "An unexpected error occurred during audio generation.";
            if (error instanceof Error) {
                if (error.message.includes('ELEVENLABS_API_KEY')) {
                    errorMessage = 'ElevenLabs API key is not configured in Supabase secrets.';
                } else if (error.message.includes('Authentication failed')) {
                    errorMessage = 'ElevenLabs authentication failed. Check your API key and account credits.';
                } else if (error.message.includes('rate limit')) {
                    errorMessage = 'ElevenLabs rate limit exceeded. Please try again later.';
                } else if (error.message.includes('quota exceeded') || error.message.includes('credits remaining')) {
                    errorMessage = error.message; // Use the detailed quota message from the Edge Function
                } else {
                    errorMessage = error.message;
                }
            }
            
            toast({
                title: "Audio Generation Failed",
                description: errorMessage,
                variant: "destructive"
            });
        } finally {
            setIsGeneratingAudio(false);
        }
    };

    // Audio player control functions
    const handlePlayPause = () => {
        if (!audioRef.current) return;
        
        if (isPlaying) {
            audioRef.current.pause();
        } else {
            audioRef.current.play();
        }
    };

    const handleTimeUpdate = () => {
        if (!audioRef.current) return;
        setCurrentTime(audioRef.current.currentTime);
    };

    const handleLoadedMetadata = () => {
        if (!audioRef.current) return;
        setDuration(audioRef.current.duration);
    };

    const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!audioRef.current || !duration) return;
        
        const rect = e.currentTarget.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const newTime = (clickX / rect.width) * duration;
        
        audioRef.current.currentTime = newTime;
        setCurrentTime(newTime);
    };

    const formatTime = (time: number) => {
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    // Close audio player
    const handleCloseAudio = () => {
        if (audioRef.current) {
            audioRef.current.pause();
        }
        setAudioUrl(null);
        setIsPlaying(false);
    };

    // Check if current module already has audio
    useEffect(() => {
        const currentModule = studyPlatform.modulos[studyPlatform.actModule];
        if (currentModule?.audioUrl) {
            setAudioUrl(currentModule.audioUrl || null);
            console.log(`Loading saved audio for module ${studyPlatform.actModule}:`, currentModule.audioUrl);
            setActiveModuleId(`module-${studyPlatform.actModule}`);
        } else {
            console.log(`No audio URL found for module ${studyPlatform.actModule}`);
            setAudioUrl(null);
        }
        setIsPlaying(false);
        setCurrentTime(0);
        setDuration(0);
    }, [studyPlatform.actModule, studyPlatform.modulos]);

    const handleGetModules = useCallback(async () => {
        if (!studyMaterial) return;

        let attempts = 0;
        while (attempts < 5) {
            try {
                const prompt = prompts.generateModules(studyMaterial);
                const response = await interactionGemini(prompt, personality);
                const responseText = response.text();
                console.log(responseText);

                if (validateJSON(responseText)) {
                    addStoriesChat(generationHistory, setGenerationHistory, prompt, response.text());
                    setActualModuleRes(response.text());
                    
                    if (user?.id) {
                        try {
                            const { data: existingSession, error: fetchError } = await supabase
                                .from('personalized_learning_sessions')
                                .select('id')
                                .eq('user_id', user.id)
                                .eq('topic', studyMaterial)
                                .eq('personality', personality)
                                .maybeSingle();

                            if (existingSession && !fetchError) {
                                setCurrentSessionId(existingSession.id);
                            } else {
                                const { data, error } = await supabase
                                    .from('personalized_learning_sessions')
                                    .insert({
                                        user_id: user.id,
                                        topic: studyMaterial,
                                        personality: personality,
                                        modules_data: [],
                                        generation_history: generationHistory,
                                    })
                                    .select()
                                    .single();
                                if (data && !error) {
                                    setCurrentSessionId(data.id);
                                }
                            }
                        } catch (dbError) {
                            console.error('Error saving session to database:', dbError);
                        }
                    }
                    break;
                } else {
                    throw new SyntaxError("Invalid JSON response.");
                }
            } catch (error) {
                console.error(error);
                attempts++;
                await delay(1000);
            } finally {
                setIntroduction({ ...introduction, isLoading: false });
                setStudyPlatform({ ...studyPlatform, isGettingModels: true });
            }
        }
    }, [generationHistory, introduction, personality, setGenerationHistory, setIntroduction, setStudyPlatform, studyMaterial, studyPlatform, user?.id, setCurrentSessionId]);

    const handleGetModule = useCallback(async () => {
        if (studyPlatform.modulos.length === 0) return;

        let attempts = 0;
        while (attempts < 5) {
            try {
                const prompt = prompts.generateModule(studyPlatform.modulos[studyPlatform.actModule]);
                const response = await interactionGemini(prompt, personality, generationHistory);
                const responseText = response.text();
                console.log(responseText);

                if (validateJSON(responseText)) {
                    generateModule(response.text(), studyPlatform, setStudyPlatform);
                    
                    if (user?.id && currentSessionId) {
                        try {
                            await supabase
                                .from('personalized_learning_sessions')
                                .update({
                                    modules_data: studyPlatform.modulos,
                                    generation_history: generationHistory,
                                })
                                .eq('id', currentSessionId);
                        } catch (dbError) {
                            console.error('Error updating session in database:', dbError);
                        }
                    }
                    break;
                } else {
                    throw new SyntaxError("Invalid JSON response.");
                }
            } catch (error) {
                console.error(error);
                attempts++;
                await delay(1000);
            } finally {
                setStudyPlatform(prevState => ({
                    ...prevState,
                    isLoading: false,
                    isGettingModulo: false,
                }));
            }
        }
    }, [generationHistory, personality, setStudyPlatform, studyPlatform, user?.id, currentSessionId]);

    useEffect(() => {
        if (introduction.isLoading) {
            handleGetModules();
        }
    }, [handleGetModules, introduction.isLoading]);

    useEffect(() => {
        if (studyPlatform.isGettingModels && studyPlatform.show === false) {
            generateModules(actualModuleRes, studyPlatform, setStudyPlatform);
        }
    }, [actualModuleRes, generationHistory, setStudyPlatform, studyPlatform]);

    useEffect(() => {
        if (!studyPlatform.isGettingModulo && !studyPlatform.isLoading) {
            setTimeout(() => {
                setTimeModule(true);
            }, 2000);
        }
    }, [studyPlatform.isGettingModulo, studyPlatform.isLoading]);

    useEffect(() => {
        if (studyPlatform.actModule > modulo) {
            if (studyPlatform.modulos[studyPlatform.actModule].isOpen === false) {
                handleGetModule();
            }

            if (studyPlatform.modulos[studyPlatform.actModule] && studyPlatform.modulos[studyPlatform.actModule].content) {
                setModulo(studyPlatform.actModule);

                if (studyPlatform.modulos[studyPlatform.actModule].isOpen === true) {
                    setStudyPlatform(prevState => ({ ...prevState, isLoading: false, isGettingModulo: false }));
                }
            }
        } else if (studyPlatform.actModule < modulo) {
            if (studyPlatform.modulos[studyPlatform.actModule] && studyPlatform.modulos[studyPlatform.actModule].content) {
                setModulo(studyPlatform.actModule);
                setStudyPlatform(prevState => ({ ...prevState, isLoading: false, isGettingModulo: false }));
            }
        }
    }, [handleGetModule, modulo, setStudyPlatform, studyPlatform.actModule, studyPlatform.modulos]);

    return (
        <div className="w-full h-full">
            <AnimatePresence mode="popLayout">
                <motion.div
                    key="study-platform-content"
                    initial="initial"
                    animate="in"
                    exit="out"
                    variants={pageVariants(2)}
                    transition={pageTransition(2)}
                    className="w-full h-full"
                >
                    {studyPlatform.isLoading ? (
                        <StudyPlatformLoading />
                    ) : (studyPlatform.isGettingModels ? (
                        <StudyPlatformInitial handleGetModule={handleGetModule} />
                    ) : (
                        <div className="w-full">
                            <Card className="mb-6 bg-[#2A2B32] border-0 rounded-xl">
                                <ScrollArea className="h-[calc(100vh-250px)]">
                                    <CardContent className="p-6 studyPlatform-content">
                                        {/* Floating Audio Generation Button */}
                                        <div className="fixed bottom-28 right-8 z-30">
                                            <Button 
                                                variant="default"
                                                size="icon"
                                                className="h-12 w-12 rounded-full shadow-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-200"
                                                onClick={handleGenerateAudio}
                                                disabled={isGeneratingAudio}
                                            >
                                                {isGeneratingAudio ? (
                                                    <Loader2 className="h-6 w-6 animate-spin" />
                                                ) : (
                                                    <Headphones className="h-6 w-6" />
                                                )}
                                            </Button>
                                        </div>

                                        {studyPlatform.modulos[studyPlatform.actModule] && 
                                         studyPlatform.modulos[studyPlatform.actModule].content && 
                                         <ContextMenu>
                                             <ContextMenuTrigger>
                                                 <div
                                                     ref={contentRef}
                                                     className="studyPlatform-content-wrapper"
                                                     data-module={`module-${studyPlatform.actModule}`}
                                                     onMouseUp={handleSelection}
                                                     onMouseDown={() => setSelectedText("")}
                                                 >
                                                     {studyPlatform.modulos[studyPlatform.actModule].content.map((item, index) => {
                                                         const key = `modulo-${studyPlatform.actModule}-content-${index}`;
                                                         const htmlContent = item.html;
                                                         
                                                         if (htmlContent.includes('<!DOCTYPE>') || htmlContent.includes('<!DOCTYPE html>')) {
                                                             return (
                                                                 <iframe
                                                                     key={key}
                                                                     srcDoc={htmlContent}
                                                                     title={key}
                                                                     className="mb-6 w-full h-[400px] border-none rounded-lg"
                                                                 />
                                                             );
                                                         } else {
                                                             return (
                                                                 <div
                                                                     key={key}
                                                                     className="mb-4"
                                                                     dangerouslySetInnerHTML={{ __html: htmlContent }}
                                                                 />
                                                             );
                                                         }
                                                     })}
                                                 </div>
                                             </ContextMenuTrigger>
                                             {selectedText && (
                                                 <ContextMenuContent>
                                                     <ContextMenuItem onClick={handleCopyText} className="gap-2">
                                                         <Copy className="h-4 w-4" />
                                                         Copy
                                                     </ContextMenuItem>
                                                     <ContextMenuItem onClick={handleSelectAll} className="gap-2">
                                                         <SelectAll className="h-4 w-4" />
                                                         Select All
                                                     </ContextMenuItem>
                                                     <ContextMenuItem onClick={handleSendToConvoAI} className="gap-2">
                                                         <MessageSquare className="h-4 w-4" />
                                                         Send to Convo AI
                                                     </ContextMenuItem>
                                                     <ContextMenuItem onClick={handleExpandText} className="gap-2">
                                                         <Expand className="h-4 w-4" />
                                                         Expand
                                                     </ContextMenuItem>
                                                 </ContextMenuContent>
                                             )}
                                         </ContextMenu>}
                                    </CardContent>
                                </ScrollArea>
                            </Card>

                            {/* Audio Player */}
                            {audioUrl && (
                                <motion.div 
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="mb-6 p-4 rounded-xl bg-[#2A2B32]/80 backdrop-blur-sm border border-primary/20 shadow-lg"
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <Volume2 className="h-5 w-5 text-primary" />
                                            <h3 className="font-medium">Audio Version</h3>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-muted-foreground">
                                                {formatTime(currentTime)} / {formatTime(duration)}
                                            </span>
                                            <Button 
                                                variant="ghost" 
                                                size="icon" 
                                                className="h-7 w-7"
                                                onClick={handleCloseAudio}
                                            >
                                                <X className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                    
                                    {/* Progress bar */}
                                    <div 
                                        className="w-full h-2 bg-primary/20 rounded-full mb-3 cursor-pointer"
                                        onClick={handleSeek}
                                    >
                                        <div 
                                            className="h-full bg-primary rounded-full"
                                            style={{ width: `${(currentTime / duration) * 100 || 0}%` }}
                                        />
                                    </div>
                                    
                                    <div className="flex items-center gap-4">
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            className="h-10 w-10 rounded-full"
                                            onClick={handlePlayPause}
                                        >
                                            {isPlaying ? (
                                                <Pause className="h-5 w-5" />
                                            ) : (
                                                <Play className="h-5 w-5" />
                                            )}
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            className="h-8 w-8 rounded-full"
                                            onClick={handleMuteToggle}
                                        >
                                            {isMuted ? (
                                                <VolumeX className="h-4 w-4" />
                                            ) : (
                                                <Volume2 className="h-4 w-4" />
                                            )}
                                        </Button>
                                    </div>
                                    
                                    <audio
                                        ref={audioRef}
                                        src={audioUrl}
                                        onPlay={() => setIsPlaying(true)}
                                        onPause={() => setIsPlaying(false)}
                                        onEnded={() => setIsPlaying(false)}
                                        onTimeUpdate={handleTimeUpdate}
                                        onLoadedMetadata={handleLoadedMetadata}
                                        className="hidden"
                                    />
                                </motion.div>
                            )}
                            
                            {/* Render Expanded Content */}
                            {expansions.length > 0 && (
                                <div className="mt-6 space-y-4">
                                    <h3 className="text-lg font-semibold flex items-center gap-2">
                                        <Expand className="h-5 w-5 text-primary" />
                                        Expanded Content
                                    </h3>
                                    {expansions.map((exp) => (
                                        <details key={exp.id} className="group rounded-lg border bg-[#2A2B32] p-4">
                                            <summary className="flex cursor-pointer items-center justify-between font-medium text-foreground list-none">
                                                <div className="flex items-center gap-2 max-w-[90%]">
                                                    <ChevronDown className="h-4 w-4 text-primary transition-transform duration-200 group-open:rotate-180 flex-shrink-0" />
                                                    <span className="line-clamp-1" title={exp.originalText}>
                                                        Original: "{exp.originalText}"
                                                    </span>
                                                </div>
                                                {exp.isLoading && <Loader2 className="h-5 w-5 animate-spin text-primary ml-2 flex-shrink-0" />}
                                            </summary>
                                            <div className="prose prose-neutral dark:prose-invert mt-4 max-w-none text-muted-foreground">
                                                {exp.expandedText ? (
                                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                        {exp.expandedText}
                                                    </ReactMarkdown>
                                                ) : (
                                                    !exp.isLoading && <p>No expanded content available.</p>
                                                )}
                                            </div>
                                        </details>
                                    ))}
                                </div>
                            )}
                            
                            <div className="flex items-center justify-between gap-4">
                                <Button
                                    variant="outline"
                                    className={`${modulo === 0 ? "invisible" : ""} bg-white/10 hover:bg-white/20 text-white border-0 rounded-lg`}
                                    onClick={() => {
                                        setStudyPlatform(prevState => ({
                                            ...prevState,
                                            actModule: prevState.actModule - 1,
                                            isGettingModulo: true,
                                            isLoading: true,
                                        }));
                                    }}
                                >
                                    <ArrowLeft className="h-4 w-4 mr-2" />
                                    Previous
                                </Button>

                                <Button
                                    variant="default"
                                    disabled={!timeModule}
                                    className="bg-white text-black hover:bg-gray-200 rounded-lg"
                                    onClick={() => {
                                        if (modulo === (studyPlatform.modulos.length - 1)) {
                                            resetContext(setIntroduction, setStudyPlatform);
                                            return;
                                        }

                                        setStudyPlatform(prevState => ({
                                            ...prevState,
                                            actModule: prevState.actModule + 1,
                                            isGettingModulo: true,
                                            isLoading: true,
                                        }));
                                    }}
                                >
                                    {modulo === (studyPlatform.modulos.length - 1) ? (
                                        <>
                                            New Topic
                                            <Award className="h-4 w-4 ml-2" />
                                        </>
                                    ) : (
                                        <>
                                            Next
                                            <ArrowRight className="h-4 w-4 ml-2" />
                                        </>
                                    )}
                                </Button>
                            </div>
                        </div>
                    ))}
                </motion.div>
            </AnimatePresence>
        </div>
    );
};

export default StudyPlatform;