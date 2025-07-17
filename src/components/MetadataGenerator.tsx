import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Upload, Sparkles, Copy, Download, Settings, Image as ImageIcon, X, FileImage, Play, Pause, Eye, EyeOff, RotateCcw } from 'lucide-react';

interface MetadataResult {
  title: string;
  description: string;
  keywords: string[];
  topTenKeywords: string[];
  altText: string;
  category: string;
}

interface ImageBatch {
  file: File;
  preview: string;
  metadata: MetadataResult | null;
  isProcessing: boolean;
  id: string;
}

// Enhanced keyword validation function to prevent stuffing
const validateAndCleanKeywords = (keywords: string[]): string[] => {
  if (!keywords || !Array.isArray(keywords)) return [];
  
  // Convert to lowercase for comparison and clean
  const processed = keywords
    .map(k => k.trim().toLowerCase())
    .filter(k => k && k.length >= 2);
  
  const unique = new Set<string>();
  const usedStems = new Set<string>();
  const usedConcepts = new Set<string>();
  
  // Enhanced word variations and similar concepts to avoid
  const wordVariations: { [key: string]: string[] } = {
    'work': ['work', 'working', 'worker', 'workers', 'workplace', 'workstation', 'workforce', 'workshop'],
    'business': ['business', 'corporate', 'professional', 'commercial', 'enterprise', 'company', 'organization'],
    'success': ['success', 'successful', 'achievement', 'accomplish', 'accomplishment', 'achieve', 'winning'],
    'team': ['team', 'teamwork', 'collaboration', 'collaborative', 'cooperative', 'group', 'partnership'],
    'technology': ['technology', 'technological', 'tech', 'digital', 'technical', 'digitization'],
    'people': ['people', 'person', 'individuals', 'humans', 'human', 'personnel', 'staff'],
    'hand': ['hand', 'hands', 'finger', 'fingers', 'palm', 'fist'],
    'office': ['office', 'workspace', 'workplace', 'workstation', 'desk'],
    'meeting': ['meeting', 'conference', 'discussion', 'presentation', 'seminar', 'workshop'],
    'computer': ['computer', 'laptop', 'desktop', 'pc', 'device', 'monitor'],
    'finance': ['finance', 'financial', 'money', 'economic', 'economy', 'fiscal', 'monetary'],
    'data': ['data', 'information', 'analytics', 'statistics', 'stats', 'analysis'],
    'growth': ['growth', 'growing', 'development', 'progress', 'progression', 'advancement'],
    'modern': ['modern', 'contemporary', 'current', 'new', 'recent', 'latest'],
    'young': ['young', 'youth', 'youthful', 'junior', 'adolescent'],
    'happy': ['happy', 'joyful', 'cheerful', 'pleased', 'delighted', 'smiling', 'smile'],
    'man': ['man', 'male', 'gentleman', 'guy', 'masculine'],
    'woman': ['woman', 'female', 'lady', 'girl', 'feminine'],
    'phone': ['phone', 'mobile', 'smartphone', 'cellphone', 'telephone'],
    'build': ['building', 'construction', 'architecture', 'structure'],
    'learn': ['learning', 'education', 'study', 'studying', 'training'],
    'create': ['creative', 'creativity', 'creation', 'design', 'designing'],
    'look': ['looking', 'view', 'viewing', 'see', 'seeing', 'watching'],
    'communication': ['communication', 'communicate', 'talking', 'speaking', 'conversation']
  };

  // Semantic concept groups - avoid having multiple words from same concept
  const conceptGroups: { [key: string]: string[] } = {
    'emotion_positive': ['happy', 'joy', 'cheerful', 'pleased', 'delighted', 'excited', 'satisfied'],
    'emotion_negative': ['sad', 'angry', 'frustrated', 'worried', 'stressed'],
    'work_concept': ['work', 'job', 'career', 'profession', 'employment', 'labor'],
    'business_concept': ['business', 'corporate', 'commercial', 'enterprise', 'company'],
    'time_concept': ['time', 'clock', 'hour', 'minute', 'schedule', 'deadline'],
    'size_concept': ['big', 'large', 'huge', 'giant', 'massive', 'enormous'],
    'color_basic': ['red', 'blue', 'green', 'yellow', 'white', 'black'],
    'direction': ['up', 'down', 'left', 'right', 'forward', 'backward'],
    'age_concept': ['young', 'old', 'new', 'ancient', 'modern', 'vintage']
  };
  
  const cleanedKeywords: string[] = [];
  
  for (const keyword of processed) {
    if (!keyword || keyword.length < 2) continue;
    
    // Check if exact keyword already exists
    if (unique.has(keyword)) continue;
    
    let shouldSkip = false;
    
    // Check for word variation conflicts
    for (const [stem, variants] of Object.entries(wordVariations)) {
      if (variants.includes(keyword)) {
        if (usedStems.has(stem)) {
          shouldSkip = true;
          break;
        }
        usedStems.add(stem);
        break;
      }
    }
    
    if (shouldSkip) continue;
    
    // Check for concept group conflicts
    for (const [concept, words] of Object.entries(conceptGroups)) {
      if (words.includes(keyword)) {
        if (usedConcepts.has(concept)) {
          shouldSkip = true;
          break;
        }
        usedConcepts.add(concept);
        break;
      }
    }
    
    if (shouldSkip) continue;
    
    // Add to unique set and final array
    unique.add(keyword);
    cleanedKeywords.push(keyword);
    
    // Stop at 22 keywords maximum (stricter limit)
    if (cleanedKeywords.length >= 22) break;
  }
  
  return cleanedKeywords.slice(0, 22);
};

const MetadataGenerator = () => {
  const [imageBatch, setImageBatch] = useState<ImageBatch[]>([]);
  const [apiKey, setApiKey] = useState<string>(localStorage.getItem('gemini-api-key') || '');
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [showApiKeyInput, setShowApiKeyInput] = useState(!apiKey);
  const [currentProcessingIndex, setCurrentProcessingIndex] = useState(-1);
  const { toast } = useToast();

  const handleBatchImageUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    
    if (files.length === 0) return;
    if (files.length > 50) {
      toast({
        title: "Too many files",
        description: "Please select maximum 50 images",
        variant: "destructive"
      });
      return;
    }

    if (imageBatch.length + files.length > 50) {
      toast({
        title: "Batch limit exceeded",
        description: `You can only process up to 50 images at once. Currently you have ${imageBatch.length} images.`,
        variant: "destructive"
      });
      return;
    }

    const newImages: ImageBatch[] = [];

    files.forEach((file) => {
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: `${file.name} is over 10MB and was skipped`,
          variant: "destructive"
        });
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const newImage: ImageBatch = {
          file,
          preview: e.target?.result as string,
          metadata: null,
          isProcessing: false,
          id: Math.random().toString(36).substr(2, 9)
        };
        
        setImageBatch(prev => [...prev, newImage]);
      };
      reader.readAsDataURL(file);
    });
  }, [toast, imageBatch.length]);

  const removeImage = (id: string) => {
    setImageBatch(prev => prev.filter(img => img.id !== id));
  };

  const saveApiKey = () => {
    if (apiKey.trim()) {
      localStorage.setItem('gemini-api-key', apiKey.trim());
      setShowApiKeyInput(false);
      toast({
        title: "API Key Saved",
        description: "Your Gemini API key has been saved locally"
      });
    }
  };

  const generateSingleMetadata = async (imageFile: File): Promise<MetadataResult> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64Image = (reader.result as string).split(',')[1];
          
          const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              contents: [{
                parts: [
                  {
                    text: `You are a professional stock photo metadata expert. Analyze this image and generate metadata optimized for iStock, Adobe Stock, Shutterstock, and Freepik.

                    STEP 1: Create title and description first
                    STEP 2: Extract key concepts from title and description 
                    STEP 3: Build keywords ONLY from those concepts

                    KEYWORD CONSISTENCY RULE:
                    Every keyword MUST be directly derived from words or concepts mentioned in the title or description. If a concept isn't in the title/description, it cannot be a keyword.

                    PROCESS:
                    1. Write a specific title describing the main subject and action
                    2. Write a description that expands on the title with context and details  
                    3. List all key concepts from title + description
                    4. Create keywords using ONLY these concepts and their logical extensions
                    
                    KEYWORD RULES:
                    - Extract 15-20 keywords directly from title/description concepts
                    - Include main subject, action, setting, mood, style mentioned in title/description
                    - Add related commercial terms that connect to your title/description theme
                    - NO generic words that aren't connected to your specific title/description
                    - Each keyword must trace back to something in title or description
                    
                    FORBIDDEN DUPLICATE CONCEPTS:
                    - work, working, worker, workplace, workforce
                    - business, corporate, professional, commercial, enterprise  
                    - happy, joyful, cheerful, pleased, delighted, smiling
                    - success, successful, achievement, accomplish, winning
                    - team, teamwork, collaboration, cooperative, group
                    - technology, tech, digital, technological
                    - people, person, individuals, humans, personnel
                    - modern, contemporary, current, new, recent
                    
                    EXAMPLE FLOW:
                    Title: "Architect reviewing blueprints in modern office"
                    Description: "Professional architect examining construction plans at desk with computer and drafting tools"
                    Key concepts: architect, blueprints, office, reviewing, construction, plans, desk, computer, drafting, tools
                    Keywords derived from these concepts: architect, blueprints, construction-plans, office-desk, drafting-tools, computer-workstation, building-design, etc.
                    
                    Generate JSON with:
                    - title: Specific SEO title (max 60 chars)
                    - description: Detailed description that expands on title (max 150 chars)
                    - keywords: 15-20 keywords derived from title/description concepts only
                    - topTenKeywords: Best 10 from main list
                    - altText: Accessibility description  
                    - category: Main category
                    
                    CRITICAL: Every keyword must connect to something mentioned in your title or description.`
                  },
                  {
                    inlineData: {
                      mimeType: imageFile.type,
                      data: base64Image
                    }
                  }
                ]
              }]
            })
          });

          if (!response.ok) {
            throw new Error('Failed to generate metadata');
          }

          const data = await response.json();
          const text = data.candidates[0].content.parts[0].text;
          
          // Extract JSON from response
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const result = JSON.parse(jsonMatch[0]);
            
            // Triple validation: AI response + keyword cleaning + final check
            result.keywords = validateAndCleanKeywords(result.keywords);
            
            // Final quality check - ensure no repetition missed
            const finalKeywords = [];
            const seenWords = new Set();
            
            for (const keyword of result.keywords) {
              const words = keyword.toLowerCase().split(/[\s-_]+/);
              let hasConflict = false;
              
              for (const word of words) {
                if (seenWords.has(word) && word.length > 2) {
                  hasConflict = true;
                  break;
                }
              }
              
              if (!hasConflict) {
                words.forEach(word => word.length > 2 && seenWords.add(word));
                finalKeywords.push(keyword);
              }
              
              if (finalKeywords.length >= 20) break;
            }
            
            result.keywords = finalKeywords;
            
            // Ensure topTenKeywords exists and has exactly 10 items from cleaned keywords
            if (!result.topTenKeywords || result.topTenKeywords.length !== 10) {
              result.topTenKeywords = result.keywords.slice(0, 10);
            }
            
            // Log for debugging
            console.log('Final keyword count:', result.keywords.length);
            console.log('Keywords:', result.keywords);
            
            resolve(result);
          } else {
            throw new Error('Invalid response format');
          }
        } catch (error) {
          reject(error);
        }
      };
      
      reader.readAsDataURL(imageFile);
    });
  };

  const processBatch = async () => {
    if (imageBatch.length === 0 || !apiKey) {
      toast({
        title: "Missing Requirements",
        description: "Please add images and provide API key",
        variant: "destructive"
      });
      return;
    }

    setIsBatchProcessing(true);
    setCurrentProcessingIndex(0);

    for (let i = 0; i < imageBatch.length; i++) {
      const image = imageBatch[i];
      setCurrentProcessingIndex(i);
      
      // Update processing status
      setImageBatch(prev => prev.map(img => 
        img.id === image.id 
          ? { ...img, isProcessing: true }
          : img
      ));

      try {
        const metadata = await generateSingleMetadata(image.file);
        
        // Update with generated metadata
        setImageBatch(prev => prev.map(img => 
          img.id === image.id 
            ? { ...img, metadata, isProcessing: false }
            : img
        ));

        // Small delay to prevent API rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`Error processing ${image.file.name}:`, error);
        
        // Update with error status
        setImageBatch(prev => prev.map(img => 
          img.id === image.id 
            ? { ...img, isProcessing: false }
            : img
        ));

        toast({
          title: "Processing Error",
          description: `Failed to process ${image.file.name}`,
          variant: "destructive"
        });
      }
    }

    setIsBatchProcessing(false);
    setCurrentProcessingIndex(-1);
    
    toast({
      title: "Batch Processing Complete!",
      description: `Processed ${imageBatch.length} images`
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied!",
      description: "Text copied to clipboard"
    });
  };

  const downloadBatchMetadata = () => {
    const processedImages = imageBatch.filter(img => img.metadata);
    if (processedImages.length === 0) return;
    
    let content = '';
    processedImages.forEach((image, index) => {
      const metadata = image.metadata!;
      content += `=== Image ${index + 1}: ${image.file.name} ===\n\n`;
      content += `Title: ${metadata.title}\n\n`;
      content += `Description: ${metadata.description}\n\n`;
      content += `Keywords: ${metadata.keywords.join(', ')}\n\n`;
      content += `Alt Text: ${metadata.altText}\n\n`;
      content += `Category: ${metadata.category}\n\n`;
      content += '---\n\n';
    });

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `batch_metadata_${processedImages.length}_images.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearBatch = () => {
    setImageBatch([]);
    setCurrentProcessingIndex(-1);
  };

  const regenerateMetadata = async (imageId: string) => {
    const image = imageBatch.find(img => img.id === imageId);
    if (!image || !apiKey) return;

    // Set processing state for this specific image
    setImageBatch(prev => prev.map(img => 
      img.id === imageId 
        ? { ...img, isProcessing: true, metadata: null }
        : img
    ));

    try {
      const metadata = await generateSingleMetadata(image.file);
      
      // Update with new metadata
      setImageBatch(prev => prev.map(img => 
        img.id === imageId 
          ? { ...img, metadata, isProcessing: false }
          : img
      ));

      toast({
        title: "Regenerated!",
        description: `New metadata generated for ${image.file.name}`
      });
      
    } catch (error) {
      console.error(`Error regenerating metadata for ${image.file.name}:`, error);
      
      setImageBatch(prev => prev.map(img => 
        img.id === imageId 
          ? { ...img, isProcessing: false }
          : img
      ));

      toast({
        title: "Regeneration Failed",
        description: `Failed to regenerate metadata for ${image.file.name}`,
        variant: "destructive"
      });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-bg p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8 animate-fade-in">
          <h1 className="text-4xl md:text-6xl font-bold bg-gradient-primary bg-clip-text text-transparent mb-4">
            Stock Image Metadata Generator
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            AI-powered batch tool to generate SEO-optimized metadata for 1-50 stock images at once
          </p>
        </div>

        {/* API Key Section */}
        {showApiKeyInput && (
          <Card className="mb-6 border-border bg-card/50 backdrop-blur">
            <CardContent className="pt-6">
              <div className="space-y-3 p-4 border border-border rounded-lg bg-accent/20">
                <Label htmlFor="api-key" className="flex items-center gap-2">
                  <Settings className="w-4 h-4" />
                  Google Gemini API Key
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="api-key"
                    type="password"
                    placeholder="Enter your Gemini API key"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="flex-1"
                  />
                  <Button onClick={saveApiKey} variant="secondary">
                    Save
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  Get your free API key from Google AI Studio
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {apiKey && !showApiKeyInput && (
          <Card className="mb-6 border-border bg-card/50 backdrop-blur">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between p-3 bg-primary/10 rounded-lg">
                <span className="text-sm text-primary">API Key configured ✓</span>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setShowApiKeyInput(true)}
                >
                  Change
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Upload Section */}
          <Card className="border-border bg-card/50 backdrop-blur">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="w-5 h-5" />
                Upload Images (1-50)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleBatchImageUpload}
                className="hidden"
                id="batch-upload"
              />
              <label
                htmlFor="batch-upload"
                className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-border rounded-lg cursor-pointer hover:bg-accent/50 transition-colors"
              >
                <div className="flex flex-col items-center">
                  <FileImage className="w-8 h-8 text-muted-foreground mb-2" />
                  <p className="text-muted-foreground text-center text-sm">
                    Click to add images<br />
                    <span className="text-xs">JPG, PNG, WEBP (max 10MB each)</span>
                  </p>
                </div>
              </label>

              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {imageBatch.length}/50 images
                </span>
                {imageBatch.length > 0 && (
                  <Button onClick={clearBatch} variant="outline" size="sm">
                    <X className="w-4 h-4 mr-2" />
                    Clear All
                  </Button>
                )}
              </div>

              <Button
                onClick={processBatch}
                disabled={imageBatch.length === 0 || !apiKey || isBatchProcessing}
                className="w-full"
                size="lg"
              >
                {isBatchProcessing ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Processing {currentProcessingIndex + 1}/{imageBatch.length}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5" />
                    Generate All Metadata
                  </div>
                )}
              </Button>

              {imageBatch.filter(img => img.metadata).length > 0 && (
                <Button
                  onClick={downloadBatchMetadata}
                  variant="outline"
                  className="w-full"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download All Results
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Image Grid */}
          <div className="lg:col-span-2">
            <Card className="border-border bg-card/50 backdrop-blur">
              <CardHeader>
                <CardTitle>Image Batch</CardTitle>
              </CardHeader>
              <CardContent>
                {imageBatch.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <ImageIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No images uploaded yet</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-96 overflow-y-auto">
                    {imageBatch.map((image) => (
                      <div key={image.id} className="border border-border rounded-lg p-3 space-y-3">
                        <div className="relative">
                          <img
                            src={image.preview}
                            alt={image.file.name}
                            className="w-full h-24 object-cover rounded"
                          />
                          <Button
                            onClick={() => removeImage(image.id)}
                            variant="destructive"
                            size="sm"
                            className="absolute top-1 right-1 w-6 h-6 p-0"
                          >
                            <X className="w-3 h-3" />
                          </Button>
                          {image.isProcessing && (
                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded">
                              <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            </div>
                          )}
                        </div>
                        
                        <div className="space-y-2">
                          <p className="text-xs font-medium truncate">{image.file.name}</p>
                          
                          {image.metadata && (
                            <div className="space-y-3 p-2 bg-accent/10 rounded-lg">
                              {/* All Keywords Section */}
                              <div>
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-xs font-semibold text-primary">All Keywords</span>
                                  <Badge variant="outline" className="text-xs px-1 py-0">
                                    {image.metadata.keywords.length} keywords
                                  </Badge>
                                </div>
                                <div className="flex flex-wrap gap-1">
                                  {image.metadata.keywords.map((keyword, idx) => (
                                    <span 
                                      key={idx} 
                                      className="inline-block px-2 py-1 text-xs bg-primary/10 text-primary border border-primary/20 rounded-full hover:bg-primary/20 transition-colors cursor-pointer"
                                      onClick={() => copyToClipboard(keyword)}
                                    >
                                      {keyword}
                                    </span>
                                  ))}
                                </div>
                              </div>

                              {/* Action Buttons */}
                              <div className="flex gap-1">
                                <Button
                                  onClick={() => copyToClipboard(image.metadata!.keywords.join(', '))}
                                  variant="outline"
                                  size="sm"
                                  className="text-xs h-7 px-2"
                                >
                                  <Copy className="w-3 h-3 mr-1" />
                                  Copy All Keywords
                                </Button>
                                <Dialog>
                                  <DialogTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="text-xs h-7 px-2"
                                    >
                                      <Eye className="w-3 h-3 mr-1" />
                                      View All
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                                    <DialogHeader>
                                      <DialogTitle className="flex items-center gap-2">
                                        <img src={image.preview} alt="" className="w-8 h-8 object-cover rounded" />
                                        Complete Metadata - {image.file.name}
                                      </DialogTitle>
                                    </DialogHeader>
                                    
                                    <div className="space-y-6 py-4">
                                      {/* Image Preview */}
                                      <div className="flex justify-center">
                                        <img 
                                          src={image.preview} 
                                          alt={image.metadata!.title}
                                          className="max-w-md max-h-64 object-contain rounded-lg border"
                                        />
                                      </div>

                                      {/* Title Section */}
                                      <div className="space-y-2">
                                        <Label className="text-sm font-semibold">Title</Label>
                                        <div className="flex gap-2">
                                          <div className="flex-1 p-3 bg-accent/20 rounded-lg border">
                                            <p className="text-sm font-medium">{image.metadata!.title}</p>
                                          </div>
                                          <Button
                                            onClick={() => copyToClipboard(image.metadata!.title)}
                                            variant="outline"
                                            size="sm"
                                          >
                                            <Copy className="w-4 h-4" />
                                          </Button>
                                        </div>
                                      </div>

                                      {/* Description Section */}
                                      <div className="space-y-2">
                                        <Label className="text-sm font-semibold">Description</Label>
                                        <div className="flex gap-2">
                                          <div className="flex-1 p-3 bg-accent/20 rounded-lg border">
                                            <p className="text-sm">{image.metadata!.description}</p>
                                          </div>
                                          <Button
                                            onClick={() => copyToClipboard(image.metadata!.description)}
                                            variant="outline"
                                            size="sm"
                                          >
                                            <Copy className="w-4 h-4" />
                                          </Button>
                                        </div>
                                      </div>

                                      {/* All Keywords Section */}
                                      <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                          <Label className="text-sm font-semibold">All Keywords ({image.metadata!.keywords.length})</Label>
                                          <Button
                                            onClick={() => copyToClipboard(image.metadata!.keywords.join(', '))}
                                            variant="outline"
                                            size="sm"
                                          >
                                            <Copy className="w-4 h-4 mr-2" />
                                            Copy All
                                          </Button>
                                        </div>
                                        <div className="p-4 bg-primary/5 rounded-lg border border-primary/20">
                                          <div className="flex flex-wrap gap-2">
                                            {image.metadata!.keywords.map((keyword, idx) => (
                                              <span 
                                                key={idx}
                                                className="inline-flex items-center px-3 py-1.5 bg-primary/10 text-primary text-sm border border-primary/30 rounded-full hover:bg-primary/20 transition-colors cursor-pointer"
                                                onClick={() => copyToClipboard(keyword)}
                                              >
                                                {keyword}
                                                <Copy className="w-3 h-3 ml-1 opacity-50" />
                                              </span>
                                            ))}
                                          </div>
                                        </div>
                                      </div>

                                      {/* Alt Text & Category */}
                                      <div className="grid md:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                          <Label className="text-sm font-semibold">Alt Text</Label>
                                          <div className="flex gap-2">
                                            <div className="flex-1 p-3 bg-accent/20 rounded-lg border">
                                              <p className="text-sm">{image.metadata!.altText}</p>
                                            </div>
                                            <Button
                                              onClick={() => copyToClipboard(image.metadata!.altText)}
                                              variant="outline"
                                              size="sm"
                                            >
                                              <Copy className="w-4 h-4" />
                                            </Button>
                                          </div>
                                        </div>

                                        <div className="space-y-2">
                                          <Label className="text-sm font-semibold">Category</Label>
                                          <div className="flex items-center gap-2">
                                            <Badge variant="default" className="text-sm py-2 px-4">
                                              {image.metadata!.category}
                                            </Badge>
                                            <Button
                                              onClick={() => copyToClipboard(image.metadata!.category)}
                                              variant="outline"
                                              size="sm"
                                            >
                                              <Copy className="w-4 h-4" />
                                            </Button>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </DialogContent>
                                </Dialog>
                              </div>

                              {/* Regenerate Button */}
                              <div className="pt-2 border-t border-border/50">
                                <Button
                                  onClick={() => regenerateMetadata(image.id)}
                                  disabled={image.isProcessing}
                                  variant="outline"
                                  size="sm"
                                  className="text-xs h-7 px-2 w-full"
                                >
                                  {image.isProcessing ? (
                                    <>
                                      <div className="w-3 h-3 mr-1 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                                      Regenerating...
                                    </>
                                  ) : (
                                    <>
                                      <RotateCcw className="w-3 h-3 mr-1" />
                                      Regenerate
                                    </>
                                  )}
                                </Button>
                              </div>

                              {/* Title & Category */}
                              <div className="pt-2 border-t border-border/50">
                                <div className="text-xs text-muted-foreground mb-1">
                                  <span className="font-medium">Title:</span> {image.metadata.title.substring(0, 30)}...
                                </div>
                                <Badge variant="secondary" className="text-xs">
                                  {image.metadata.category}
                                </Badge>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MetadataGenerator;