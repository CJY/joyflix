/* eslint-disable @next/next/no-img-element */

import { useRouter } from 'next/navigation';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { SearchResult } from '@/lib/types';
import { getVideoResolutionFromM3u8, processImageUrl } from '@/lib/utils';

interface VideoInfo {
  quality: string;
  loadSpeed: string;
  pingTime: number;
  hasError?: boolean;
}

interface EpisodeSelectorProps {
  totalEpisodes: number;
  episodes_titles: string[];
  value?: number;
  onChange?: (episodeNumber: number) => void;
  onSourceChange?: (source: string, id: string, title: string) => void;
  currentSource?: string;
  currentId?: string;
  videoTitle?: string;
  videoYear?: string;
  availableSources?: SearchResult[];
  sourceSearchLoading?: boolean;
  sourceSearchError?: string | null;
  precomputedVideoInfo?: Map<string, VideoInfo>;
}

const EpisodeSelector: React.FC<EpisodeSelectorProps> = ({
  totalEpisodes,
  episodes_titles,
  value = 1,
  onChange,
  onSourceChange,
  currentSource,
  currentId,
  videoTitle,
  availableSources = [],
  sourceSearchLoading = false,
  sourceSearchError = null,
  precomputedVideoInfo,
}) => {
  const router = useRouter();

  const [videoInfoMap, setVideoInfoMap] = useState<Map<string, VideoInfo>>(
    new Map()
  );
  const [attemptedSources, setAttemptedSources] = useState<Set<string>>(
    new Set()
  );

  const attemptedSourcesRef = useRef<Set<string>>(new Set());
  const videoInfoMapRef = useRef<Map<string, VideoInfo>>(new Map());

  useEffect(() => {
    attemptedSourcesRef.current = attemptedSources;
  }, [attemptedSources]);

  useEffect(() => {
    videoInfoMapRef.current = videoInfoMap;
  }, [videoInfoMap]);

  const [activeTab, setActiveTab] = useState<'episodes' | 'sources'>(
    totalEpisodes > 1 ? 'episodes' : 'sources'
  );

  const getVideoInfo = useCallback(async (source: SearchResult) => {
    const sourceKey = `${source.source}-${source.id}`;

    if (attemptedSourcesRef.current.has(sourceKey)) {
      return;
    }

    if (!source.episodes || source.episodes.length === 0) {
      return;
    }
    const episodeUrl =
      source.episodes.length > 1 ? source.episodes[1] : source.episodes[0];

    setAttemptedSources((prev) => new Set(prev).add(sourceKey));

    try {
      const info = await getVideoResolutionFromM3u8(episodeUrl);
      setVideoInfoMap((prev) => new Map(prev).set(sourceKey, info));
    } catch (error) {
      setVideoInfoMap((prev) =>
        new Map(prev).set(sourceKey, {
          quality: '错误',
          loadSpeed: '未知',
          pingTime: 0,
          hasError: true,
        })
      );
    }
  }, []);

  useEffect(() => {
    if (precomputedVideoInfo && precomputedVideoInfo.size > 0) {
      setVideoInfoMap((prev) => {
        const newMap = new Map(prev);
        precomputedVideoInfo.forEach((value, key) => {
          newMap.set(key, value);
        });
        return newMap;
      });

      setAttemptedSources((prev) => {
        const newSet = new Set(prev);
        precomputedVideoInfo.forEach((info, key) => {
          if (!info.hasError) {
            newSet.add(key);
          }
        });
        return newSet;
      });

      precomputedVideoInfo.forEach((info, key) => {
        if (!info.hasError) {
          attemptedSourcesRef.current.add(key);
        }
      });
    }
  }, [precomputedVideoInfo]);

  const [optimizationEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('enableOptimization');
      if (saved !== null) {
        try {
          return JSON.parse(saved);
        } catch {
          /* ignore */
        }
      }
    }
    return true;
  });

  useEffect(() => {
    const fetchVideoInfosInBatches = async () => {
      if (
        !optimizationEnabled ||
        activeTab !== 'sources' ||
        availableSources.length === 0
      )
        return;

      const pendingSources = availableSources.filter((source) => {
        const sourceKey = `${source.source}-${source.id}`;
        return !attemptedSourcesRef.current.has(sourceKey);
      });

      if (pendingSources.length === 0) return;

      const batchSize = Math.ceil(pendingSources.length / 2);

      for (let start = 0; start < pendingSources.length; start += batchSize) {
        const batch = pendingSources.slice(start, start + batchSize);
        await Promise.all(batch.map(getVideoInfo));
      }
    };

    fetchVideoInfosInBatches();
  }, [activeTab, availableSources, getVideoInfo, optimizationEnabled]);

  const EPISODES_PER_PAGE = 250;
  const pageCount = Math.ceil(totalEpisodes / EPISODES_PER_PAGE);
  const [currentPage, setCurrentPage] = useState(0);

  const pageLabels = useMemo(() => {
    return Array.from({ length: pageCount }, (_, i) => {
      const start = i * EPISODES_PER_PAGE + 1;
      const end = Math.min(start + EPISODES_PER_PAGE - 1, totalEpisodes);
      return `${start}-${end}`;
    });
  }, [pageCount, totalEpisodes]);

  const handleEpisodeClick = useCallback(
    (episodeNumber: number) => {
      onChange?.(episodeNumber);
    },
    [onChange]
  );

  const handleSourceClick = useCallback(
    (source: SearchResult) => {
      onSourceChange?.(source.source, source.id, source.title);
    },
    [onSourceChange]
  );

  const handleSourceTabClick = () => {
    setActiveTab('sources');
  };

  const currentStart = currentPage * EPISODES_PER_PAGE + 1;
  const currentEnd = Math.min(currentStart + EPISODES_PER_PAGE - 1, totalEpisodes);

  return (
    <div className='md:ml-2 px-4 py-0 min-h-0 rounded-xl bg-black/10 dark:bg-white/5 flex flex-col border border-white/0 dark:border-white/30 overflow-hidden'>
      <div className='flex mb-1 -mx-6 flex-shrink-0'>
        {totalEpisodes > 1 && (
          <div
            onClick={() => setActiveTab('episodes')}
            className={`flex-1 py-3 px-6 text-center cursor-pointer transition-all duration-200 font-medium
              ${
                activeTab === 'episodes'
                  ? 'text-blue-400 dark:text-blue-300'
                  : 'text-gray-700 hover:text-blue-400 bg-black/5 dark:bg-white/5 dark:text-gray-300 dark:hover:text-blue-300 hover:bg-black/3 dark:hover:bg-white/3'
              }
            `.trim()}
          >
            集数
          </div>
        )}
        <div
          onClick={handleSourceTabClick}
          className={`flex-1 py-3 px-6 text-center cursor-pointer transition-all duration-200 font-medium
            ${
              activeTab === 'sources'
                ? 'text-blue-400 dark:text-blue-300'
                : 'text-gray-700 hover:text-blue-400 bg-black/5 dark:bg-white/5 dark:text-gray-300 dark:hover:text-blue-300 hover:bg-black/3 dark:hover:bg-white/3'
            }
          `.trim()}
        >
          路线
        </div>
      </div>

      {activeTab === 'episodes' && (
        <>
          {pageCount > 1 && (
            <div className='flex items-center gap-2 mb-3 border-b border-gray-300 dark:border-gray-700 -mx-6 px-6 flex-shrink-0 overflow-x-auto'>
              {pageLabels.map((label, idx) => (
                <button
                  key={label}
                  onClick={() => setCurrentPage(idx)}
                  className={`relative py-2 text-sm font-medium whitespace-nowrap flex-shrink-0 px-3 transition-colors
                    ${
                      idx === currentPage
                        ? 'text-blue-400 dark:text-blue-300'
                        : 'text-gray-700 hover:text-blue-400 dark:text-gray-300 dark:hover:text-blue-300'
                    }
                  `.trim()}
                >
                  {label}
                  {idx === currentPage && (
                    <div className='absolute bottom-0 left-0 right-0 h-0.5 bg-blue-400 dark:bg-blue-300' />
                  )}
                </button>
              ))}
            </div>
          )}

          <div className='pb-4'>
            <div className='grid grid-cols-5 gap-2'>
              {Array.from({ length: currentEnd - currentStart + 1 }, (_, i) => currentStart + i).map((episodeNumber) => {
                const isActive = episodeNumber === value;
                const title = episodes_titles?.[episodeNumber - 1] ?? '';
                const displayTitle = (() => {
                  if (!title) return '';
                  const match = title.match(/第(\d+)集/);
                  if (match) return '';
                  return title;
                })();
                return (
                  <button
                    key={episodeNumber}
                    onClick={() => handleEpisodeClick(episodeNumber - 1)}
                    className={`flex flex-col items-center justify-center px-1 py-2 text-xs rounded-lg transition-all duration-200 select-none min-h-[48px]
                      ${
                        isActive
                          ? 'bg-blue-400 text-white shadow-lg shadow-blue-400/25'
                          : 'bg-gray-200/70 text-gray-700 hover:bg-gray-300 dark:bg-white/10 dark:text-gray-300 dark:hover:bg-white/20'
                      }`.trim()}
                  >
                    <span className='font-bold leading-tight'>{episodeNumber}</span>
                    {displayTitle && (
                      <span className='truncate w-full text-center leading-tight mt-0.5 opacity-80'>{displayTitle}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {activeTab === 'sources' && (
        <div className='flex flex-col h-full mt-4'>
          {sourceSearchLoading && (
            <div className='flex items-center justify-center py-8'>
              <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400'></div>
              <span className='ml-2 text-sm text-gray-600 dark:text-gray-300'>
                搜索中...
              </span>
            </div>
          )}

          {sourceSearchError && (
            <div className='flex items-center justify-center py-8'>
              <div className='text-center'>
                <div className='text-red-500 text-2xl mb-2'>⚠️</div>
                <p className='text-sm text-red-600 dark:text-red-400'>
                  {sourceSearchError}
                </p>
              </div>
            </div>
          )}

          {!sourceSearchLoading &&
            !sourceSearchError &&
            availableSources.length === 0 && (
              <div className='flex items-center justify-center py-8'>
                <div className='text-center'>
                  <div className='text-gray-400 text-2xl mb-2'>📺</div>
                  <p className='text-sm text-gray-600 dark:text-gray-300'>
                    暂无可用的路线
                  </p>
                </div>
              </div>
            )}

          {!sourceSearchLoading &&
            !sourceSearchError &&
            availableSources.length > 0 && (
              <div className='flex-1 overflow-y-auto space-y-2 pb-20'>
                {availableSources
                  .sort((a, b) => {
                    const aIsCurrent =
                      a.source?.toString() === currentSource?.toString() &&
                      a.id?.toString() === currentId?.toString();
                    const bIsCurrent =
                      b.source?.toString() === currentSource?.toString() &&
                      b.id?.toString() === currentId?.toString();
                    if (aIsCurrent && !bIsCurrent) return -1;
                    if (!aIsCurrent && bIsCurrent) return 1;
                    return 0;
                  })
                  .map((source, index) => {
                    const isCurrentSource =
                      source.source?.toString() === currentSource?.toString() &&
                      source.id?.toString() === currentId?.toString();
                    return (
                      <div
                        key={`${source.source}-${source.id}`}
                        onClick={() =>
                          !isCurrentSource && handleSourceClick(source)
                        }
                        className={`flex items-start gap-3 px-2 py-3 rounded-lg transition-all select-none duration-200 relative
                      ${
                        isCurrentSource
                          ? 'bg-blue-400/10 dark:bg-blue-400/20 border-blue-400/30 border'
                          : 'hover:bg-gray-200/50 dark:hover:bg-white/10 hover:scale-[1.02] cursor-pointer'
                      }`.trim()}
                      >
                        <div className='flex-shrink-0 w-12 h-20 bg-gray-300 dark:bg-gray-600 rounded overflow-hidden'>
                          {source.episodes && source.episodes.length > 0 && (
                            <img
                              src={processImageUrl(source.poster)}
                              alt={source.title}
                              className='w-full h-full object-cover'
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.style.display = 'none';
                              }}
                            />
                          )}
                        </div>

                        <div className='flex-1 min-w-0 flex flex-col justify-between h-20'>
                          <div className='flex items-start justify-between gap-3 h-6'>
                            <div className='flex-1 min-w-0 relative group/title'>
                              <h3 className='font-medium text-base truncate text-gray-900 dark:text-gray-100 leading-none'>
                                {source.title}
                              </h3>
                              {index !== 0 && (
                                <div className='absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-1 bg-gray-800 text-white text-xs rounded-md shadow-lg opacity-0 invisible group-hover/title:opacity-100 group-hover/title:visible transition-all duration-200 ease-out delay-100 whitespace-nowrap z-[500] pointer-events-none'>
                                  {source.title}
                                  <div className='absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-800'></div>
                                </div>
                              )}
                            </div>
                            {(() => {
                              const sourceKey = `${source.source}-${source.id}`;
                              const videoInfo = videoInfoMap.get(sourceKey);

                              if (videoInfo && videoInfo.quality !== '未知') {
                                if (videoInfo.hasError) {
                                  return (
                                    <div className='bg-gray-500/10 dark:bg-gray-400/20 text-red-600 dark:text-red-400 px-1.5 py-0 rounded text-xs flex-shrink-0 min-w-[50px] text-center'>
                                      检测失败
                                    </div>
                                  );
                                } else {
                                  let textColorStyle = {};
                                  let textColorClasses = '';

                                  switch (videoInfo.quality) {
                                    case '4K':
                                      textColorStyle = { color: '#9370db' };
                                      break;
                                    case '2K':
                                      textColorClasses = 'text-blue-400 dark:text-blue-300';
                                      break;
                                    case '1080P':
                                      textColorStyle = { color: '#6b8e23' };
                                      break;
                                    case '720P':
                                      textColorStyle = { color: '#b8860b' };
                                      break;
                                    case '480P':
                                      textColorStyle = { color: '#d2691e' };
                                      break;
                                    case 'SD':
                                      textColorStyle = { color: '#b22222' };
                                      break;
                                    default:
                                      textColorClasses = 'text-gray-600 dark:text-gray-400';
                                      break;
                                  }

                                  return (
                                    <div
                                      className={`bg-gray-500/10 dark:bg-gray-400/20 px-1.5 py-0 rounded text-xs flex-shrink-0 min-w-[50px] text-center ${textColorClasses}`}
                                      style={textColorStyle}
                                    >
                                      {videoInfo.quality}
                                    </div>
                                  );
                                }
                              }

                              return null;
                            })()}
                          </div>

                          <div className='flex items-center justify-between'>
                            <span className='text-xs px-2 py-1 border border-gray-500/60 rounded text-gray-700 dark:text-gray-300'>
                              {source.source_name}
                            </span>
                            {source.episodes.length > 1 && (
                              <span className='text-xs text-gray-500 dark:text-gray-400 font-medium'>
                                {source.episodes.length} 集
                              </span>
                            )}
                          </div>

                          <div className='flex items-end h-6'>
                            {(() => {
                              const sourceKey = `${source.source}-${source.id}`;
                              const videoInfo = videoInfoMap.get(sourceKey);
                              if (videoInfo) {
                                if (!videoInfo.hasError) {
                                  return (
                                    <div className='flex items-end gap-3 text-xs'>
                                      <div className='text-blue-400 dark:text-blue-300 font-medium text-xs'>
                                        {videoInfo.loadSpeed}
                                      </div>
                                      <div className='text-orange-600 dark:text-orange-400 font-medium text-xs'>
                                        {videoInfo.pingTime}ms
                                      </div>
                                    </div>
                                  );
                                } else {
                                  return (
                                    <div className='text-red-500/90 dark:text-red-400 font-medium text-xs'>
                                      无测速数据
                                    </div>
                                  );
                                }
                              }
                            })()}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                <div className='flex-shrink-0 mt-auto pt-2 border-t border-gray-400 dark:border-gray-700'>
                  <button
                    onClick={() => {
                      if (videoTitle) {
                        router.push(
                          `/search?q=${encodeURIComponent(videoTitle)}`
                        );
                      }
                    }}
                    className='w-full text-center text-xs text-gray-500 dark:text-gray-400 hover:text-blue-400 dark:hover:text-blue-300 transition-colors py-2'
                  >
                    影片有误？点击去搜索
                  </button>
                </div>
              </div>
            )}
        </div>
      )}
    </div>
  );
};

export default EpisodeSelector;
