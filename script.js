class CryptoAnalyzer {
    constructor() {
        this.coins = [];
        this.isLoading = false;
        this.updateTimer = null;
        this.countdownTimer = null;
        this.okxClient = new OKXApiClient();
        this.init();
    }

    // ... باقي الكود كما هو ...

    // استبدال دالة fetchAndAnalyzeCoins
    async fetchAndAnalyzeCoins() {
        try {
            // التحقق من صحة التكوين
            if (!validateConfig()) {
                console.warn('لم يتم تكوين API، استخدام البيانات التجريبية...');
                this.showNotification('تم استخدام البيانات التجريبية - يرجى تكوين API', 'warning');
                const mockData = await this.getMockData();
                return this.processCoinData(mockData);
            }

            // جلب البيانات الحقيقية من OKX
            const realData = await this.fetchRealDataFromOKX();
            return this.processCoinData(realData);
            
        } catch (error) {
            console.error('خطأ في جلب البيانات:', error);
            this.showNotification('خطأ في الاتصال بـ API، استخدام البيانات التجريبية', 'error');
            const mockData = await this.getMockData();
            return this.processCoinData(mockData);
        }
    }

    // دالة جديدة لجلب البيانات الحقيقية من OKX
    async fetchRealDataFromOKX() {
        this.showNotification('جاري جلب البيانات من OKX...', 'info');
        
        try {
            // جلب قائمة العملات
            const instruments = await this.okxClient.getInstruments();
            console.log(`تم جلب ${instruments.length} عملة من OKX`);

            const marketData = [];
            const batchSize = 10; // معالجة 10 عملات في كل مرة
            
            for (let i = 0; i < Math.min(instruments.length, 100); i += batchSize) {
                const batch = instruments.slice(i, i + batchSize);
                const batchPromises = batch.map(async (inst) => {
                    try {
                        const stats = await this.okxClient.get24HrStats(inst.instId);
                        if (stats && stats.volumeUsdt >= CONFIG.FILTERS.MIN_VOLUME) {
                            return {
                                ...stats,
                                marketCap: stats.volumeUsdt * 100 // تقدير تقريبي
                            };
                        }
                        return null;
                    } catch (error) {
                        console.warn(`خطأ في جلب بيانات ${inst.instId}:`, error);
                        return null;
                    }
                });

                const batchResults = await Promise.all(batchPromises);
                marketData.push(...batchResults.filter(data => data !== null));
                
                // تأخير بسيط لتجنب تجاوز حدود API
                await this.okxClient.delay(200);
                
                // تحديث التقدم
                const progress = Math.min(100, ((i + batchSize) / Math.min(instruments.length, 100)) * 100);
                console.log(`تقدم جلب البيانات: ${progress.toFixed(1)}%`);
            }

            console.log(`تم جلب بيانات ${marketData.length} عملة بنجاح`);
            this.showNotification(`تم جلب ${marketData.length} عملة من OKX بنجاح`, 'success');
            
            return marketData;
            
        } catch (error) {
            console.error('خطأ في جلب البيانات من OKX:', error);
            throw error;
        }
    }

    // دالة لمعالجة بيانات العملات
    async processCoinData(coinDataArray) {
        const analyzedCoins = [];
        
        for (const coinData of coinDataArray) {
            try {
                // تحليل العملة مع البيانات الحقيقية
                const analysis = await this.analyzeCoinWithRealData(coinData);
                if (analysis.score >= 50) {
                    analyzedCoins.push(analysis);
                }
            } catch (error) {
                console.warn(`خطأ في تحليل ${coinData.symbol}:`, error);
            }
        }

        // ترتيب حسب النقاط
        this.coins = analyzedCoins
            .sort((a, b) => b.score - a.score)
            .slice(0, CONFIG.FILTERS.MAX_RESULTS);
    }

       // تحليل العملة مع البيانات الحقيقية
    async analyzeCoinWithRealData(coinData) {
        let score = 0;
        const indicators = {};

        try {
            // جلب بيانات الشموع للتحليل الفني
            let candles = [];
            if (validateConfig()) {
                candles = await this.okxClient.getCandlestickData(`${coinData.symbol}-USDT`, '1H', 100);
            }

            // 1. تحليل RSI
            const rsi = candles.length > 0 ? 
                this.calculateRealRSI(candles) : 
                this.calculateRSI(coinData);
            indicators.rsi = rsi;
            if (rsi > CONFIG.INDICATORS.RSI.BREAKOUT_LEVEL && rsi < 70) {
                score += CONFIG.SCORING.RSI_BREAKOUT;
                indicators.rsiSignal = 'اختراق صعودي';
            }

            // 2. تحليل MACD
            const macd = candles.length > 0 ? 
                this.calculateRealMACD(candles) : 
                this.calculateMACD(coinData);
            indicators.macd = macd;
            if (macd.signal === 'bullish') {
                score += CONFIG.SCORING.MACD_SIGNAL;
                indicators.macdSignal = 'إشارة صعودية';
            }

            // 3. تحليل المتوسط المتحرك
            const sma = candles.length > 0 ? 
                this.calculateRealSMA(candles) : 
                this.calculateSMA(coinData);
            indicators.sma = sma;
            if (coinData.price > sma) {
                score += CONFIG.SCORING.SMA_BREAKOUT;
                indicators.smaSignal = 'فوق المتوسط المتحرك';
            }

            // 4. تحليل حجم التداول المحسن
            const volumeAnalysis = this.calculateAdvancedVolumeAnalysis(coinData, candles);
            indicators.volumeAnalysis = volumeAnalysis;
            if (volumeAnalysis.increase > 20) {
                score += CONFIG.SCORING.VOLUME_INCREASE;
                indicators.volumeSignal = `زيادة ${volumeAnalysis.increase.toFixed(1)}%`;
            }

            // 5. قوة الاتجاه المحسنة
            const trendStrength = this.calculateAdvancedTrendStrength(coinData, candles);
            indicators.trendStrength = trendStrength;
            if (trendStrength.strength > 60) {
                score += CONFIG.SCORING.TREND_STRENGTH;
                indicators.trendSignal = `اتجاه ${trendStrength.direction} قوي`;
            }

            // حساب مستويات الدعم والمقاومة المحسنة
            const levels = this.calculateAdvancedSupportResistance(coinData, candles);

            // حساب الأهداف السعرية المحسنة
            const targets = this.calculateAdvancedPriceTargets(coinData, levels, indicators);

            // نقطة الدخول ووقف الخسارة المحسنة
            const entryExit = this.calculateAdvancedEntryExit(coinData, levels, indicators);

            return {
                ...coinData,
                score: Math.min(score, 100),
                indicators,
                levels,
                targets,
                entryExit,
                analysis: this.generateAdvancedAnalysis(coinData, indicators, score)
            };

        } catch (error) {
            console.warn(`خطأ في تحليل ${coinData.symbol}:`, error);
            // العودة للتحليل البسيط في حالة الخطأ
            return this.analyzeCoin(coinData);
        }
    }

    // حساب مستويات الدعم والمقاومة المحسنة
    calculateAdvancedSupportResistance(coinData, candles = []) {
        const currentPrice = coinData.price;
        const high24h = coinData.high24h;
        const low24h = coinData.low24h;

        if (candles.length > 0) {
            // استخدام بيانات الشموع لحساب مستويات أكثر دقة
            const highs = candles.map(c => c.high).sort((a, b) => b - a);
            const lows = candles.map(c => c.low).sort((a, b) => a - b);
            const closes = candles.map(c => c.close);

            // حساب النقاط المحورية (Pivot Points)
            const pivot = (high24h + low24h + currentPrice) / 3;
            
            // مستويات المقاومة
            const r1 = (2 * pivot) - low24h;
            const r2 = pivot + (high24h - low24h);
            const r3 = high24h + 2 * (pivot - low24h);

            // مستويات الدعم
            const s1 = (2 * pivot) - high24h;
            const s2 = pivot - (high24h - low24h);
            const s3 = low24h - 2 * (high24h - pivot);

            // مستويات فيبوناتشي
            const fibRange = high24h - low24h;
            const fib236 = high24h - (fibRange * 0.236);
            const fib382 = high24h - (fibRange * 0.382);
            const fib618 = high24h - (fibRange * 0.618);

            return {
                pivot,
                resistance1: r1,
                resistance2: r2,
                resistance3: r3,
                support1: s1,
                support2: s2,
                support3: s3,
                fibonacci: {
                    level236: fib236,
                    level382: fib382,
                    level618: fib618
                },
                // مستويات ديناميكية من الشموع
                dynamicResistance: this.findDynamicLevels(candles, 'resistance'),
                dynamicSupport: this.findDynamicLevels(candles, 'support'),
                // قوة المستويات
                levelStrength: this.calculateLevelStrength(candles, currentPrice)
            };
        } else {
            // الحساب التقليدي للبيانات المحدودة
            const pivot = (high24h + low24h + currentPrice) / 3;
            return {
                pivot,
                resistance1: (2 * pivot) - low24h,
                resistance2: pivot + (high24h - low24h),
                resistance3: high24h + 2 * (pivot - low24h),
                support1: (2 * pivot) - high24h,
                support2: pivot - (high24h - low24h),
                support3: low24h - 2 * (high24h - pivot),
                fibonacci: {
                    level236: high24h - ((high24h - low24h) * 0.236),
                    level382: high24h - ((high24h - low24h) * 0.382),
                    level618: high24h - ((high24h - low24h) * 0.618)
                }
            };
        }
    }

    // العثور على المستويات الديناميكية
    findDynamicLevels(candles, type = 'resistance') {
        const levels = [];
        const lookback = Math.min(50, candles.length);
        const recentCandles = candles.slice(-lookback);

        for (let i = 2; i < recentCandles.length - 2; i++) {
            const current = recentCandles[i];
            const prev2 = recentCandles[i - 2];
            const prev1 = recentCandles[i - 1];
            const next1 = recentCandles[i + 1];
            const next2 = recentCandles[i + 2];

            if (type === 'resistance') {
                // البحث عن قمم
                if (current.high > prev2.high && current.high > prev1.high && 
                    current.high > next1.high && current.high > next2.high) {
                    levels.push({
                        price: current.high,
                        timestamp: current.timestamp,
                        strength: this.calculateLevelTouchCount(recentCandles, current.high, 0.01)
                    });
                }
            } else {
                // البحث عن قيعان
                if (current.low < prev2.low && current.low < prev1.low && 
                    current.low < next1.low && current.low < next2.low) {
                    levels.push({
                        price: current.low,
                        timestamp: current.timestamp,
                        strength: this.calculateLevelTouchCount(recentCandles, current.low, 0.01)
                    });
                }
            }
        }

        // ترتيب حسب القوة والعودة بأقوى 3 مستويات
        return levels
            .sort((a, b) => b.strength - a.strength)
            .slice(0, 3)
            .map(level => level.price);
    }

    // حساب عدد مرات لمس المستوى
    calculateLevelTouchCount(candles, level, tolerance = 0.01) {
        let touchCount = 0;
        const upperBound = level * (1 + tolerance);
        const lowerBound = level * (1 - tolerance);

        candles.forEach(candle => {
            if ((candle.high >= lowerBound && candle.high <= upperBound) ||
                (candle.low >= lowerBound && candle.low <= upperBound)) {
                touchCount++;
            }
        });

        return touchCount;
    }

    // حساب قوة المستويات
    calculateLevelStrength(candles, currentPrice) {
        const recentVolume = candles.slice(-10).reduce((sum, c) => sum + c.volume, 0) / 10;
        const priceVolatility = this.calculateVolatility(candles.slice(-20));
        
        return {
            volumeStrength: recentVolume,
            volatility: priceVolatility,
            momentum: this.calculateMomentum(candles.slice(-14))
        };
    }

    // حساب الأهداف السعرية المحسنة
    calculateAdvancedPriceTargets(coinData, levels, indicators) {
        const currentPrice = coinData.price;
        const change24h = coinData.change24h;
        
        // حساب المدى اليومي
        const dailyRange = coinData.high24h - coinData.low24h;
        const avgTrueRange = dailyRange * 1.2; // تقدير ATR مبسط

        // الأهداف قصيرة المدى (1-3 أيام)
        const shortTermTargets = {
            conservative: currentPrice + (avgTrueRange * 0.5),
            moderate: currentPrice + (avgTrueRange * 0.8),
            aggressive: currentPrice + (avgTrueRange * 1.2)
        };

        // الأهداف متوسطة المدى (1-2 أسبوع)
        const mediumTermTargets = {
            target1: levels.resistance1,
            target2: levels.resistance2,
            target3: levels.resistance3
        };

        // الهدف طويل المدى المحسن
        let longTermTarget;
        
        // حساب الهدف بناءً على عدة عوامل
        const trendMultiplier = change24h > 0 ? 1 + (change24h / 100) : 1;
        const volumeMultiplier = coinData.volume24h > 1000000000 ? 1.1 : 1.05;
        const rsiMultiplier = indicators.rsi > 60 ? 1.15 : 1.08;
        
        // استخدام مستوى المقاومة الثالث كأساس
        const baseTarget = levels.resistance3 || (currentPrice * 1.2);
        
        longTermTarget = baseTarget * trendMultiplier * volumeMultiplier * rsiMultiplier;
        
        // التأكد من أن الهدف منطقي (لا يتجاوز 50% من السعر الحالي)
        const maxReasonableTarget = currentPrice * 1.5;
        if (longTermTarget > maxReasonableTarget) {
            longTermTarget = maxReasonableTarget;
        }

        // حساب الأهداف بناءً على فيبوناتشي
        const fibonacciTargets = this.calculateFibonacciTargets(coinData, levels);

        return {
            // الأهداف قصيرة المدى
            immediate: shortTermTargets.conservative,
            target1: shortTermTargets.moderate,
            target2: shortTermTargets.aggressive,
            
            // الأهداف متوسطة المدى
            target3: mediumTermTargets.target1,
            target4: mediumTermTargets.target2,
            
            // الهدف طويل المدى المحسن
            longTerm: longTermTarget,
            
            // أهداف فيبوناتشي
            fibonacci: fibonacciTargets,
            
            // معلومات إضافية
            targetInfo: {
                avgTrueRange: avgTrueRange,
                trendStrength: trendMultiplier,
                volumeImpact: volumeMultiplier,
                rsiImpact: rsiMultiplier,
                timeframes: {
                    immediate: '1-6 ساعات',
                    short: '1-3 أيام', 
                    medium: '1-2 أسبوع',
                    long: '1-4 أسابيع'
                }
            }
        };
    }

    // حساب أهداف فيبوناتشي
    calculateFibonacciTargets(coinData, levels) {
        const currentPrice = coinData.price;
        const range = coinData.high24h - coinData.low24h;
        
        return {
            fib127: currentPrice + (range * 1.272),
            fib162: currentPrice + (range * 1.618),
            fib200: currentPrice + (range * 2.0),
            fib262: currentPrice + (range * 2.618)
        };
    }

        // حساب نقاط الدخول والخروج المحسنة
    calculateAdvancedEntryExit(coinData, levels, indicators) {
        const currentPrice = coinData.price;
        const dailyRange = coinData.high24h - coinData.low24h;
        
        // نقطة الدخول المثلى
        let entryPoint;
        if (indicators.rsi < 50) {
            // RSI منخفض - يمكن الدخول بالسعر الحالي
            entryPoint = currentPrice * 0.998;
        } else if (indicators.rsi > 70) {
            // RSI مرتفع - انتظار تصحيح
            entryPoint = currentPrice * 0.985;
        } else {
            // RSI متوسط - دخول تدريجي
            entryPoint = currentPrice * 0.995;
        }

        // حساب وقف الخسارة الذكي
        const stopLossOptions = {
            conservative: Math.max(levels.support1, currentPrice * 0.92), // 8% كحد أقصى
            moderate: Math.max(levels.support2, currentPrice * 0.88),     // 12% كحد أقصى
            aggressive: Math.max(levels.support3, currentPrice * 0.85)    // 15% كحد أقصى
        };

        // اختيار وقف الخسارة بناءً على التقلبات
        const volatility = this.calculateSimpleVolatility(coinData);
        let recommendedStopLoss;
        
        if (volatility < 5) {
            recommendedStopLoss = stopLossOptions.conservative;
        } else if (volatility < 10) {
            recommendedStopLoss = stopLossOptions.moderate;
        } else {
            recommendedStopLoss = stopLossOptions.aggressive;
        }

        // حساب جني الأرباح المتدرج
        const takeProfitLevels = {
            tp1: currentPrice * 1.05,  // 5% ربح - بيع 25%
            tp2: currentPrice * 1.10,  // 10% ربح - بيع 35%
            tp3: currentPrice * 1.15,  // 15% ربح - بيع 25%
            tp4: currentPrice * 1.25   // 25% ربح - بيع الباقي
        };

        // حساب نسبة المخاطرة للعائد
        const riskRewardRatio = (takeProfitLevels.tp2 - entryPoint) / (entryPoint - recommendedStopLoss);

        return {
            entryPoint,
            stopLoss: {
                recommended: recommendedStopLoss,
                conservative: stopLossOptions.conservative,
                moderate: stopLossOptions.moderate,
                aggressive: stopLossOptions.aggressive
            },
            takeProfit: takeProfitLevels,
            riskManagement: {
                riskRewardRatio: riskRewardRatio.toFixed(2),
                maxRiskPercent: ((entryPoint - recommendedStopLoss) / entryPoint * 100).toFixed(1),
                positionSizing: this.calculatePositionSize(entryPoint, recommendedStopLoss),
                strategy: this.getRecommendedStrategy(indicators, riskRewardRatio)
            }
        };
    }

    // حساب التقلبات البسيط
    calculateSimpleVolatility(coinData) {
        const range = ((coinData.high24h - coinData.low24h) / coinData.price) * 100;
        return Math.abs(coinData.change24h) + (range * 0.5);
    }

    // حساب حجم المركز المناسب
    calculatePositionSize(entryPrice, stopLoss) {
        const riskPerTrade = 2; // 2% مخاطرة لكل صفقة
        const riskAmount = entryPrice - stopLoss;
        const riskPercent = (riskAmount / entryPrice) * 100;
        
        return {
            recommendedRisk: `${riskPerTrade}%`,
            actualRisk: `${riskPercent.toFixed(1)}%`,
            suggestion: riskPercent > 10 ? 'تقليل حجم المركز' : 'حجم مناسب'
        };
    }

    // الحصول على الاستراتيجية المناسبة
    getRecommendedStrategy(indicators, riskRewardRatio) {
        if (riskRewardRatio >= 3) {
            return 'استراتيجية عدوانية - نسبة مخاطرة ممتازة';
        } else if (riskRewardRatio >= 2) {
            return 'استراتيجية متوسطة - نسبة مخاطرة جيدة';
        } else if (riskRewardRatio >= 1.5) {
            return 'استراتيجية محافظة - نسبة مخاطرة مقبولة';
        } else {
            return 'تجنب الدخول - نسبة مخاطرة عالية';
        }
    }

    // تحليل حجم التداول المتقدم
    calculateAdvancedVolumeAnalysis(coinData, candles = []) {
        if (candles.length > 0) {
            const recentVolumes = candles.slice(-24).map(c => c.volume);
            const avgVolume = recentVolumes.reduce((sum, vol) => sum + vol, 0) / recentVolumes.length;
            const currentVolume = candles[candles.length - 1].volume;
            
            const volumeIncrease = ((currentVolume - avgVolume) / avgVolume) * 100;
            const volumeTrend = this.calculateVolumeTrend(recentVolumes);
            
            return {
                current: currentVolume,
                average: avgVolume,
                increase: volumeIncrease,
                trend: volumeTrend,
                strength: this.getVolumeStrength(volumeIncrease)
            };
        } else {
            // تحليل مبسط للبيانات المحدودة
            const estimatedAvgVolume = coinData.volume24h * 0.8;
            const increase = Math.random() * 50; // محاكاة
            
            return {
                current: coinData.volume24h,
                average: estimatedAvgVolume,
                increase: increase,
                trend: increase > 20 ? 'صاعد' : 'مستقر',
                strength: this.getVolumeStrength(increase)
            };
        }
    }

    // حساب اتجاه حجم التداول
    calculateVolumeTrend(volumes) {
        if (volumes.length < 5) return 'غير محدد';
        
        const recent = volumes.slice(-5);
        const older = volumes.slice(-10, -5);
        
        const recentAvg = recent.reduce((sum, vol) => sum + vol, 0) / recent.length;
        const olderAvg = older.reduce((sum, vol) => sum + vol, 0) / older.length;
        
        const change = ((recentAvg - olderAvg) / olderAvg) * 100;
        
        if (change > 15) return 'صاعد بقوة';
        if (change > 5) return 'صاعد';
        if (change < -15) return 'هابط بقوة';
        if (change < -5) return 'هابط';
        return 'مستقر';
    }

    // تحديد قوة حجم التداول
    getVolumeStrength(increase) {
        if (increase > 50) return 'قوي جداً';
        if (increase > 30) return 'قوي';
        if (increase > 15) return 'متوسط';
        if (increase > 0) return 'ضعيف';
        return 'سلبي';
    }

    // حساب قوة الاتجاه المتقدمة
    calculateAdvancedTrendStrength(coinData, candles = []) {
        if (candles.length > 0) {
            const closes = candles.map(c => c.close);
            const sma20 = this.calculateSMAFromArray(closes, 20);
            const sma50 = this.calculateSMAFromArray(closes, 50);
            
            const currentPrice = closes[closes.length - 1];
            const priceVsSMA20 = ((currentPrice - sma20) / sma20) * 100;
            const priceVsSMA50 = ((currentPrice - sma50) / sma50) * 100;
            
            // حساب ADX مبسط
            const adx = this.calculateSimpleADX(candles);
            
            let direction = 'محايد';
            let strength = 50;
            
            if (priceVsSMA20 > 2 && priceVsSMA50 > 1) {
                direction = 'صاعد';
                strength = Math.min(90, 60 + adx);
            } else if (priceVsSMA20 < -2 && priceVsSMA50 < -1) {
                direction = 'هابط';
                strength = Math.min(90, 60 + adx);
            } else {
                strength = 40 + (adx * 0.5);
            }
            
            return {
                direction,
                strength,
                adx,
                priceVsSMA20: priceVsSMA20.toFixed(2),
                priceVsSMA50: priceVsSMA50.toFixed(2)
            };
        } else {
            // حساب مبسط
            const change = coinData.change24h;
            const direction = change > 1 ? 'صاعد' : change < -1 ? 'هابط' : 'محايد';
            const strength = Math.min(90, Math.abs(change) * 10 + 40);
            
            return { direction, strength };
        }
    }

    // حساب SMA من مصفوفة
    calculateSMAFromArray(prices, period) {
        if (prices.length < period) return prices[prices.length - 1];
        const recent = prices.slice(-period);
        return recent.reduce((sum, price) => sum + price, 0) / period;
    }

    // حساب ADX مبسط
    calculateSimpleADX(candles, period = 14) {
        if (candles.length < period + 1) return 25;
        
        let dmPlus = 0;
        let dmMinus = 0;
        let trSum = 0;
        
        for (let i = 1; i <= period; i++) {
            const current = candles[candles.length - i];
            const previous = candles[candles.length - i - 1];
            
            const highDiff = current.high - previous.high;
            const lowDiff = previous.low - current.low;
            
            if (highDiff > lowDiff && highDiff > 0) dmPlus += highDiff;
            if (lowDiff > highDiff && lowDiff > 0) dmMinus += lowDiff;
            
            const tr = Math.max(
                current.high - current.low,
                Math.abs(current.high - previous.close),
                Math.abs(current.low - previous.close)
            );
            trSum += tr;
        }
        
        const diPlus = (dmPlus / trSum) * 100;
        const diMinus = (dmMinus / trSum) * 100;
        const dx = Math.abs(diPlus - diMinus) / (diPlus + diMinus) * 100;
        
        return dx || 25;
    }

    // حساب التقلبات
    calculateVolatility(candles) {
        if (candles.length < 2) return 5;
        
        const returns = [];
        for (let i = 1; i < candles.length; i++) {
            const returnRate = (candles[i].close - candles[i-1].close) / candles[i-1].close;
            returns.push(returnRate);
        }
        
        const avgReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
        const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / returns.length;
        
        return Math.sqrt(variance) * 100;
    }

    // حساب الزخم
    calculateMomentum(candles) {
        if (candles.length < 2) return 0;
        
        const current = candles[candles.length - 1].close;
        const previous = candles[0].close;
        
        return ((current - previous) / previous) * 100;
    }

    // تحليل متقدم محسن
    generateAdvancedAnalysis(coinData, indicators, score) {
        let analysis = '';
        let signals = [];
        
        // تحليل النقاط
        if (score >= 85) {
            analysis = `🚀 إشارة استثنائية للشراء! العملة تظهر اختراقات فنية قوية مع تأكيدات متعددة.`;
            signals.push('إشارة قوية جداً');
        } else if (score >= 70) {
            analysis = `📈 إشارة قوية للشراء. المؤشرات الفنية تدعم الاتجاه الصعودي بقوة.`;
            signals.push('إشارة قوية');
        } else if (score >= 55) {
            analysis = `⚡ إشارة جيدة للشراء. يُنصح بالدخول مع إدارة مخاطر محكمة.`;
            signals.push('إشارة متوسطة');
        } else {
            analysis = `⚠️ إشارة ضعيفة. يُنصح بالانتظار لتأكيدات إضافية.`;
            signals.push('إشارة ضعيفة');
        }

        // تحليل المؤشرات
        if (indicators.rsiSignal) {
            analysis += ` مؤشر RSI (${indicators.rsi.toFixed(1)}) يظهر ${indicators.rsiSignal}.`;
            signals.push(`RSI: ${indicators.rsiSignal}`);
        }
        
        if (indicators.macdSignal) {
            analysis += ` MACD يعطي ${indicators.macdSignal}.`;
            signals.push(`MACD: ${indicators.macdSignal}`);
        }
        
                if (indicators.volumeSignal) {
            analysis += ` حجم التداول يظهر ${indicators.volumeSignal}.`;
            signals.push(`الحجم: ${indicators.volumeSignal}`);
        }
        
        if (indicators.trendSignal) {
            analysis += ` ${indicators.trendSignal}.`;
            signals.push(`الاتجاه: ${indicators.trendSignal}`);
        }

        // تحليل المخاطر
        const riskLevel = this.assessRiskLevel(indicators, score);
        analysis += ` مستوى المخاطرة: ${riskLevel.level}.`;
        
        return {
            summary: analysis,
            signals: signals,
            riskAssessment: riskLevel,
            recommendation: this.getTradeRecommendation(score, indicators),
            confidence: this.calculateConfidenceLevel(indicators, score)
        };
    }

    // تقييم مستوى المخاطرة
    assessRiskLevel(indicators, score) {
        let riskScore = 0;
        let riskFactors = [];

        // تقييم RSI
        if (indicators.rsi > 80) {
            riskScore += 30;
            riskFactors.push('RSI في منطقة التشبع الشرائي');
        } else if (indicators.rsi < 20) {
            riskScore += 20;
            riskFactors.push('RSI في منطقة التشبع البيعي');
        }

        // تقييم التقلبات
        if (indicators.volumeAnalysis && indicators.volumeAnalysis.increase > 100) {
            riskScore += 25;
            riskFactors.push('حجم تداول مرتفع جداً');
        }

        // تقييم قوة الاتجاه
        if (indicators.trendStrength && indicators.trendStrength.strength < 40) {
            riskScore += 20;
            riskFactors.push('اتجاه ضعيف');
        }

        // تحديد مستوى المخاطرة
        let level, color, advice;
        if (riskScore <= 20) {
            level = 'منخفض';
            color = 'green';
            advice = 'مناسب للمبتدئين';
        } else if (riskScore <= 40) {
            level = 'متوسط';
            color = 'orange';
            advice = 'يتطلب خبرة متوسطة';
        } else if (riskScore <= 60) {
            level = 'مرتفع';
            color = 'red';
            advice = 'للمتداولين المتقدمين فقط';
        } else {
            level = 'مرتفع جداً';
            color = 'darkred';
            advice = 'تجنب أو استخدم مبالغ صغيرة';
        }

        return {
            level,
            score: riskScore,
            color,
            advice,
            factors: riskFactors
        };
    }

    // الحصول على توصية التداول
    getTradeRecommendation(score, indicators) {
        if (score >= 80) {
            return {
                action: 'شراء قوي',
                timeframe: 'فوري إلى 24 ساعة',
                allocation: '3-5% من المحفظة',
                strategy: 'دخول تدريجي على 2-3 دفعات'
            };
        } else if (score >= 65) {
            return {
                action: 'شراء',
                timeframe: '1-3 أيام',
                allocation: '2-3% من المحفظة',
                strategy: 'دخول عند أي تراجع طفيف'
            };
        } else if (score >= 50) {
            return {
                action: 'مراقبة',
                timeframe: '3-7 أيام',
                allocation: '1-2% من المحفظة',
                strategy: 'انتظار تأكيدات إضافية'
            };
        } else {
            return {
                action: 'تجنب',
                timeframe: 'غير محدد',
                allocation: '0%',
                strategy: 'انتظار إشارات أفضل'
            };
        }
    }

    // حساب مستوى الثقة
    calculateConfidenceLevel(indicators, score) {
        let confidence = 0;
        let factors = [];

        // عدد المؤشرات الإيجابية
        let positiveIndicators = 0;
        if (indicators.rsiSignal) positiveIndicators++;
        if (indicators.macdSignal) positiveIndicators++;
        if (indicators.volumeSignal) positiveIndicators++;
        if (indicators.trendSignal) positiveIndicators++;

        confidence += (positiveIndicators / 4) * 40;
        factors.push(`${positiveIndicators}/4 مؤشرات إيجابية`);

        // قوة النقاط
        confidence += (score / 100) * 35;
        factors.push(`نقاط التحليل: ${score}/100`);

        // تناسق الإشارات
        if (indicators.rsi && indicators.macd) {
            const rsiTrend = indicators.rsi > 50 ? 'bullish' : 'bearish';
            const macdTrend = indicators.macd.signal || 'neutral';
            if ((rsiTrend === 'bullish' && macdTrend === 'bullish') ||
                (rsiTrend === 'bearish' && macdTrend === 'bearish')) {
                confidence += 15;
                factors.push('تناسق بين المؤشرات');
            }
        }

        // حجم التداول
        if (indicators.volumeAnalysis && indicators.volumeAnalysis.increase > 20) {
            confidence += 10;
            factors.push('دعم من حجم التداول');
        }

        confidence = Math.min(95, Math.max(5, confidence));

        let level;
        if (confidence >= 80) level = 'عالي جداً';
        else if (confidence >= 65) level = 'عالي';
        else if (confidence >= 50) level = 'متوسط';
        else if (confidence >= 35) level = 'منخفض';
        else level = 'منخفض جداً';

        return {
            percentage: confidence.toFixed(1),
            level,
            factors
        };
    }

    // تحديث عرض النتائج المحسن
    displayResults(results) {
        const resultsDiv = document.getElementById('results');
        if (!results || results.length === 0) {
            resultsDiv.innerHTML = '<div class="no-results">لم يتم العثور على عملات تطابق المعايير</div>';
            return;
        }

        let html = `
            <div class="results-header">
                <h2>🎯 نتائج التحليل المتقدم</h2>
                <div class="results-summary">
                    تم العثور على <strong>${results.length}</strong> عملة مناسبة للتداول
                </div>
            </div>
        `;

        results.forEach((coin, index) => {
            const riskColor = coin.analysis?.riskAssessment?.color || 'gray';
            const confidenceColor = this.getConfidenceColor(coin.analysis?.confidence?.percentage || 0);
            
            html += `
                <div class="coin-card enhanced" data-symbol="${coin.symbol}">
                    <div class="coin-header">
                        <div class="coin-info">
                            <h3>${coin.symbol}</h3>
                            <div class="coin-price">
                                <span class="price">$${coin.price.toFixed(6)}</span>
                                <span class="change ${coin.change24h >= 0 ? 'positive' : 'negative'}">
                                    ${coin.change24h >= 0 ? '+' : ''}${coin.change24h.toFixed(2)}%
                                </span>
                            </div>
                        </div>
                        <div class="coin-score">
                            <div class="score-circle" style="background: conic-gradient(#4CAF50 ${coin.score * 3.6}deg, #eee 0deg)">
                                <span>${coin.score}</span>
                            </div>
                        </div>
                    </div>

                    <div class="analysis-summary">
                        <div class="confidence-risk">
                            <div class="confidence">
                                <span class="label">مستوى الثقة:</span>
                                <span class="value" style="color: ${confidenceColor}">
                                    ${coin.analysis?.confidence?.percentage || 'N/A'}% (${coin.analysis?.confidence?.level || 'غير محدد'})
                                </span>
                            </div>
                            <div class="risk">
                                <span class="label">المخاطرة:</span>
                                <span class="value" style="color: ${riskColor}">
                                    ${coin.analysis?.riskAssessment?.level || 'غير محدد'}
                                </span>
                            </div>
                        </div>
                        <div class="recommendation">
                            <strong>التوصية:</strong> ${coin.analysis?.recommendation?.action || 'غير محدد'}
                            ${coin.analysis?.recommendation?.allocation ? `(${coin.analysis.recommendation.allocation})` : ''}
                        </div>
                    </div>

                    <div class="technical-indicators">
                        <div class="indicator-row">
                            <div class="indicator">
                                <span class="label">RSI:</span>
                                <span class="value ${this.getRSIColor(coin.indicators?.rsi)}">
                                    ${coin.indicators?.rsi?.toFixed(1) || 'N/A'}
                                </span>
                            </div>
                            <div class="indicator">
                                <span class="label">MACD:</span>
                                <span class="value">${coin.indicators?.macdSignal || 'محايد'}</span>
                            </div>
                            <div class="indicator">
                                <span class="label">الحجم:</span>
                                <span class="value">${coin.indicators?.volumeAnalysis?.strength || 'متوسط'}</span>
                            </div>
                            <div class="indicator">
                                <span class="label">الاتجاه:</span>
                                <span class="value">${coin.indicators?.trendStrength?.direction || 'محايد'}</span>
                            </div>
                        </div>
                    </div>

                    <div class="price-levels">
                        <div class="levels-section">
                            <h4>📊 المستويات الفنية</h4>
                            <div class="levels-grid">
                                <div class="level support">
                                    <span class="label">الدعم الأول:</span>
                                    <span class="value">$${coin.levels?.support1?.toFixed(6) || 'N/A'}</span>
                                </div>
                                <div class="level resistance">
                                    <span class="label">المقاومة الأولى:</span>
                                    <span class="value">$${coin.levels?.resistance1?.toFixed(6) || 'N/A'}</span>
                                </div>
                                <div class="level pivot">
                                    <span class="label">النقطة المحورية:</span>
                                    <span class="value">$${coin.levels?.pivot?.toFixed(6) || 'N/A'}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="targets-section">
                        <h4>🎯 الأهداف السعرية</h4>
                        <div class="targets-grid">
                            <div class="target immediate">
                                <span class="label">فوري:</span>
                                <span class="value">$${coin.targets?.immediate?.toFixed(6) || 'N/A'}</span>
                                <span class="timeframe">(1-6 ساعات)</span>
                            </div>
                            <div class="target short">
                                <span class="label">قصير المدى:</span>
                                <span class="value">$${coin.targets?.target2?.toFixed(6) || 'N/A'}</span>
                                <span class="timeframe">(1-3 أيام)</span>
                            </div>
                            <div class="target medium">
                                <span class="label">متوسط المدى:</span>
                                <span class="value">$${coin.targets?.target4?.toFixed(6) || 'N/A'}</span>
                                <span class="timeframe">(1-2 أسبوع)</span>
                            </div>
                            <div class="target long">
                                <span class="label">طويل المدى:</span>
                                <span class="value">$${coin.targets?.longTerm?.toFixed(6) || 'N/A'}</span>
                                <span class="timeframe">(1-4 أسابيع)</span>
                            </div>
                        </div>
                    </div>

                    <div class="entry-exit-section">
                        <h4>📈 نقاط الدخول والخروج</h4>
                        <div class="entry-exit-grid">
                            <div class="entry">
                                <span class="label">نقطة الدخول:</span>
                                <span class="value entry-price">$${coin.entryExit?.entryPoint?.toFixed(6) || 'N/A'}</span>
                            </div>
                            <div class="stop-loss">
                                <span class="label">وقف الخسارة:</span>
                                <span class="value stop-price">$${coin.entryExit?.stopLoss?.recommended?.toFixed(6) || 'N/A'}</span>
                            </div>
                            <div class="risk-reward">
                                <span class="label">نسبة المخاطرة:</span>
                                <span class="value">${coin.entryExit?.riskManagement?.riskRewardRatio || 'N/A'}:1</span>
                            </div>
                        </div>
                        <div class="take-profit-levels">
                            <span class="label">مستويات جني الأرباح:</span>
                            <div class="tp-levels">
                                <span class="tp">TP1: $${coin.entryExit?.takeProfit?.tp1?.toFixed(6) || 'N/A'}</span>
                                <span class="tp">TP2: $${coin.entryExit?.takeProfit?.tp2?.toFixed(6) || 'N/A'}
                                <span class="tp">TP3: $${coin.entryExit?.takeProfit?.tp3?.toFixed(6) || 'N/A'}</span>
                                <span class="tp">TP4: $${coin.entryExit?.takeProfit?.tp4?.toFixed(6) || 'N/A'}</span>
                            </div>
                        </div>
                    </div>

                    <div class="analysis-details">
                        <h4>📋 تحليل مفصل</h4>
                        <div class="analysis-text">
                            ${coin.analysis?.summary || 'لا يوجد تحليل متاح'}
                        </div>
                        
                        ${coin.analysis?.signals?.length > 0 ? `
                        <div class="signals-list">
                            <span class="signals-label">الإشارات:</span>
                            <div class="signals">
                                ${coin.analysis.signals.map(signal => `<span class="signal-tag">${signal}</span>`).join('')}
                            </div>
                        </div>
                        ` : ''}

                        ${coin.analysis?.riskAssessment?.factors?.length > 0 ? `
                        <div class="risk-factors">
                            <span class="risk-label">عوامل المخاطرة:</span>
                            <ul class="risk-list">
                                ${coin.analysis.riskAssessment.factors.map(factor => `<li>${factor}</li>`).join('')}
                            </ul>
                        </div>
                        ` : ''}

                        <div class="strategy-advice">
                            <strong>نصيحة الاستراتيجية:</strong>
                            ${coin.entryExit?.riskManagement?.strategy || 'غير محدد'}
                        </div>
                    </div>

                    <div class="additional-info">
                        <div class="volume-info">
                            <span class="label">حجم التداول 24س:</span>
                            <span class="value">$${this.formatLargeNumber(coin.volume24h)}</span>
                        </div>
                        <div class="market-cap" ${coin.marketCap ? '' : 'style="display:none"'}>
                            <span class="label">القيمة السوقية:</span>
                            <span class="value">$${coin.marketCap ? this.formatLargeNumber(coin.marketCap) : 'N/A'}</span>
                        </div>
                        <div class="last-update">
                            <span class="label">آخر تحديث:</span>
                            <span class="value">${new Date().toLocaleString('ar-SA')}</span>
                        </div>
                    </div>

                    <div class="action-buttons">
                        <button class="btn-primary" onclick="window.open('https://www.okx.com/trade-spot/${coin.symbol.toLowerCase()}-usdt', '_blank')">
                            🚀 تداول على OKX
                        </button>
                        <button class="btn-secondary" onclick="copyAnalysis('${coin.symbol}')">
                            📋 نسخ التحليل
                        </button>
                        <button class="btn-info" onclick="showDetailedChart('${coin.symbol}')">
                            📊 الرسم البياني
                        </button>
                    </div>
                </div>
            `;
        });

        // إضافة ملاحظات مهمة
        html += `
            <div class="important-notes">
                <h3>⚠️ ملاحظات مهمة</h3>
                <ul>
                    <li><strong>إدارة المخاطر:</strong> لا تستثمر أكثر من 2-5% من محفظتك في صفقة واحدة</li>
                    <li><strong>وقف الخسارة:</strong> استخدم دائماً أوامر وقف الخسارة لحماية رأس المال</li>
                    <li><strong>جني الأرباح:</strong> اتبع استراتيجية جني الأرباح المتدرج</li>
                    <li><strong>التحليل الأساسي:</strong> تأكد من الأخبار والأحداث المؤثرة على العملة</li>
                    <li><strong>السوق:</strong> هذا التحليل للأغراض التعليمية وليس نصيحة استثمارية</li>
                </ul>
            </div>

            <div class="market-summary">
                <h3>📈 ملخص السوق</h3>
                <div class="summary-stats">
                    <div class="stat">
                        <span class="label">إجمالي العملات المحللة:</span>
                        <span class="value">${results.length}</span>
                    </div>
                    <div class="stat">
                        <span class="label">متوسط النقاط:</span>
                        <span class="value">${(results.reduce((sum, coin) => sum + coin.score, 0) / results.length).toFixed(1)}</span>
                    </div>
                    <div class="stat">
                        <span class="label">أعلى نقاط:</span>
                        <span class="value">${Math.max(...results.map(coin => coin.score))}</span>
                    </div>
                </div>
            </div>
        `;

        resultsDiv.innerHTML = html;
        
        // إضافة تأثيرات التحميل
        this.addLoadingEffects();
    }

    // الحصول على لون مؤشر RSI
    getRSIColor(rsi) {
        if (!rsi) return '';
        if (rsi > 70) return 'rsi-overbought';
        if (rsi < 30) return 'rsi-oversold';
        if (rsi > 50) return 'rsi-bullish';
        return 'rsi-bearish';
    }

    // الحصول على لون مستوى الثقة
    getConfidenceColor(confidence) {
        if (confidence >= 80) return '#4CAF50';
        if (confidence >= 65) return '#8BC34A';
        if (confidence >= 50) return '#FFC107';
        if (confidence >= 35) return '#FF9800';
        return '#F44336';
    }

    // تنسيق الأرقام الكبيرة
    formatLargeNumber(num) {
        if (!num) return 'N/A';
        if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
        if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
        if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
        return num.toFixed(2);
    }

    // إضافة تأثيرات التحميل
    addLoadingEffects() {
        const coinCards = document.querySelectorAll('.coin-card');
        coinCards.forEach((card, index) => {
            card.style.opacity = '0';
            card.style.transform = 'translateY(20px)';
            setTimeout(() => {
                card.style.transition = 'all 0.5s ease';
                card.style.opacity = '1';
                card.style.transform = 'translateY(0)';
            }, index * 100);
        });
    }
}

// دوال مساعدة إضافية
function copyAnalysis(symbol) {
    const coinCard = document.querySelector(`[data-symbol="${symbol}"]`);
    if (!coinCard) return;

    const analysisText = coinCard.querySelector('.analysis-text')?.textContent || '';
    const price = coinCard.querySelector('.price')?.textContent || '';
    const change = coinCard.querySelector('.change')?.textContent || '';
    const targets = Array.from(coinCard.querySelectorAll('.target .value')).map(el => el.textContent).join(', ');
    
    const copyText = `
🎯 تحليل ${symbol}
💰 السعر: ${price} (${change})
📊 الأهداف: ${targets}
📋 التحليل: ${analysisText}
⏰ وقت التحليل: ${new Date().toLocaleString('ar-SA')}
    `.trim();

    navigator.clipboard.writeText(copyText).then(() => {
        showNotification('تم نسخ التحليل بنجاح!', 'success');
    }).catch(() => {
        showNotification('فشل في نسخ التحليل', 'error');
    });
}

function showDetailedChart(symbol) {
    // فتح الرسم البياني في نافذة جديدة
    const chartUrl = `https://www.tradingview.com/chart/?symbol=OKX:${symbol}USDT`;
    window.open(chartUrl, '_blank');
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 8px;
        color: white;
        font-weight: bold;
        z-index: 10000;
        animation: slideIn 0.3s ease;
    `;

    if (type === 'success') notification.style.backgroundColor = '#4CAF50';
    else if (type === 'error') notification.style.backgroundColor = '#F44336';
    else notification.style.backgroundColor = '#2196F3';

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// تحديث CSS للتصميم المحسن
const enhancedCSS = `
    .coin-card.enhanced {
        background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
        border: none;
        border-radius: 15px;
        margin-bottom: 25px;
        padding: 0;
        overflow: hidden;
        box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        transition: all 0.3s ease;
    }

    .coin-card.enhanced:hover {
        transform: translateY(-5px);
        box-shadow: 0 15px 40px rgba(0,0,0,0.4);
    }

    .coin-header {
        background: rgba(255,255,255,0.1);
        padding: 20px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid rgba(255,255,255,0.1);
    }

    .coin-info h3 {
        color: #fff;
        margin: 0 0 10px 0;
        font-size: 24px;
        font-weight: bold;
    }

    .coin-price {
        display: flex;
        align-items: center;
        gap: 15px;
    }

    .price {
        color: #fff;
        font-size: 18px;
        font-weight: bold;
    }

    .change.positive {
        background: #4CAF50;
        color: white;
        padding: 5px 10px;
        border-radius: 20px;
        font-size: 14px;
    }

    .change.negative {
        background: #F44336;
        color: white;
        padding: 5px 10px;
        border-radius: 20px;
        font-size: 14px;
    }

    .score-circle {
        width: 60px;
        height: 60px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
    }

    .score-circle span {
        color: #333;
        font-weight: bold;
        font-size: 16px;
        z-index: 1;
        background: white;
        width: 45px;
        height: 45px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .analysis-summary {
        padding: 20px;
        background: rgba(255,255,255,0.05);
        border-bottom: 1px solid rgba(255,255,255,0.1);
    }

    .confidence-risk {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 20px;
        margin-bottom: 15px;
    }

    .confidence, .risk {
        display: flex;
        flex-direction: column;
        gap: 5px;
    }

    .confidence .label, .risk .label {
        color: #ccc;
        font-size: 14px;
    }

    .confidence .value, .risk .value {
        font-weight: bold;
        font-size: 16px;
    }

    .recommendation {
        color: #fff;
        font-size: 16px;
        padding: 10px;
        background: rgba(255,255,255,0.1);
        border-radius: 8px;
    }

    .technical-indicators {
        padding: 20px;
        border-bottom: 1px solid rgba(255,255,255,0.1);
    }

    .indicator-row {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
        gap: 15px;
    }

    .indicator {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 10px;
        background: rgba(255,255,255,0.1);
        border-radius: 8px;
    }

    .indicator .label {
        color: #ccc;
        font-size: 12px;
        margin-bottom: 5px;
    }

    .indicator .value {
        color: #fff;
        font-weight: bold;
        font-size: 14px;
    }

    .rsi-overbought { color: #F44336 !important; }
    .rsi-oversold { color: #4CAF50 !important; }
    .rsi-bullish { color: #8BC34A !important; }
    .rsi-bearish { color: #FF9800 !important; }

    .price-levels, .targets-section, .entry-exit-section, .analysis-details {
        padding: 20px;
        border-bottom: 1px solid rgba(255,255,255,0.1);
    }

       .price-levels h4, .targets-section h4, .entry-exit-section h4, .analysis-details h4 {
        color: #fff;
        margin: 0 0 15px 0;
        font-size: 18px;
        display: flex;
        align-items: center;
        gap: 10px;
    }

    .levels-grid, .targets-grid, .entry-exit-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 15px;
    }

    .level, .target, .entry, .stop-loss, .risk-reward {
        background: rgba(255,255,255,0.1);
        padding: 15px;
        border-radius: 10px;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .level.support {
        border-left: 4px solid #4CAF50;
    }

    .level.resistance {
        border-left: 4px solid #F44336;
    }

    .level.pivot {
        border-left: 4px solid #FF9800;
    }

    .target.immediate {
        border-left: 4px solid #2196F3;
    }

    .target.short {
        border-left: 4px solid #9C27B0;
    }

    .target.medium {
        border-left: 4px solid #FF5722;
    }

    .target.long {
        border-left: 4px solid #795548;
    }

    .level .label, .target .label, .entry .label, .stop-loss .label, .risk-reward .label {
        color: #ccc;
        font-size: 14px;
        font-weight: normal;
    }

    .level .value, .target .value, .entry .value, .stop-loss .value, .risk-reward .value {
        color: #fff;
        font-size: 16px;
        font-weight: bold;
    }

    .timeframe {
        color: #999;
        font-size: 12px;
        font-style: italic;
    }

    .entry-price {
        color: #4CAF50 !important;
    }

    .stop-price {
        color: #F44336 !important;
    }

    .take-profit-levels {
        margin-top: 15px;
        padding: 15px;
        background: rgba(255,255,255,0.05);
        border-radius: 10px;
    }

    .take-profit-levels .label {
        color: #ccc;
        font-size: 14px;
        display: block;
        margin-bottom: 10px;
    }

    .tp-levels {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
        gap: 10px;
    }

    .tp {
        background: rgba(76, 175, 80, 0.2);
        color: #4CAF50;
        padding: 8px 12px;
        border-radius: 6px;
        text-align: center;
        font-size: 13px;
        font-weight: bold;
    }

    .analysis-text {
        color: #fff;
        line-height: 1.6;
        margin-bottom: 15px;
        padding: 15px;
        background: rgba(255,255,255,0.05);
        border-radius: 10px;
        border-right: 4px solid #2196F3;
    }

    .signals-list {
        margin-bottom: 15px;
    }

    .signals-label {
        color: #ccc;
        font-size: 14px;
        display: block;
        margin-bottom: 10px;
    }

    .signals {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
    }

    .signal-tag {
        background: linear-gradient(45deg, #4CAF50, #45a049);
        color: white;
        padding: 6px 12px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: bold;
    }

    .risk-factors {
        margin-bottom: 15px;
    }

    .risk-label {
        color: #ccc;
        font-size: 14px;
        display: block;
        margin-bottom: 10px;
    }

    .risk-list {
        color: #ffcdd2;
        margin: 0;
        padding-right: 20px;
    }

    .risk-list li {
        margin-bottom: 5px;
        font-size: 14px;
    }

    .strategy-advice {
        color: #fff;
        padding: 15px;
        background: rgba(255,255,255,0.1);
        border-radius: 10px;
        border-right: 4px solid #FF9800;
    }

    .additional-info {
        padding: 20px;
        background: rgba(255,255,255,0.05);
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 15px;
    }

    .volume-info, .market-cap, .last-update {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px;
        background: rgba(255,255,255,0.1);
        border-radius: 8px;
    }

    .volume-info .label, .market-cap .label, .last-update .label {
        color: #ccc;
        font-size: 14px;
    }

    .volume-info .value, .market-cap .value, .last-update .value {
        color: #fff;
        font-weight: bold;
        font-size: 14px;
    }

    .action-buttons {
        padding: 20px;
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
    }

    .btn-primary, .btn-secondary, .btn-info {
        flex: 1;
        min-width: 150px;
        padding: 12px 20px;
        border: none;
        border-radius: 8px;
        font-weight: bold;
        cursor: pointer;
        transition: all 0.3s ease;
        text-decoration: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
    }

    .btn-primary {
        background: linear-gradient(45deg, #4CAF50, #45a049);
        color: white;
    }

    .btn-primary:hover {
        background: linear-gradient(45deg, #45a049, #3d8b40);
        transform: translateY(-2px);
    }

    .btn-secondary {
        background: linear-gradient(45deg, #2196F3, #1976D2);
        color: white;
    }

    .btn-secondary:hover {
        background: linear-gradient(45deg, #1976D2, #1565C0);
        transform: translateY(-2px);
    }

    .btn-info {
        background: linear-gradient(45deg, #FF9800, #F57C00);
        color: white;
    }

    .btn-info:hover {
        background: linear-gradient(45deg, #F57C00, #E65100);
        transform: translateY(-2px);
    }

    .important-notes {
        background: linear-gradient(135deg, #d32f2f 0%, #f44336 100%);
        color: white;
        padding: 25px;
        border-radius: 15px;
        margin: 25px 0;
        box-shadow: 0 5px 15px rgba(211, 47, 47, 0.3);
    }

    .important-notes h3 {
        margin: 0 0 20px 0;
        font-size: 20px;
        display: flex;
        align-items: center;
        gap: 10px;
    }

    .important-notes ul {
        margin: 0;
        padding-right: 20px;
    }

    .important-notes li {
        margin-bottom: 10px;
        line-height: 1.5;
    }

    .important-notes strong {
        color: #ffeb3b;
    }

    .market-summary {
        background: linear-gradient(135deg, #1976D2 0%, #2196F3 100%);
        color: white;
        padding: 25px;
        border-radius: 15px;
        margin: 25px 0;
        box-shadow: 0 5px 15px rgba(25, 118, 210, 0.3);
    }

    .market-summary h3 {
        margin: 0 0 20px 0;
        font-size: 20px;
        display: flex;
        align-items: center;
        gap: 10px;
    }

    .summary-stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 20px;
    }

    .stat {
        background: rgba(255,255,255,0.1);
        padding: 15px;
        border-radius: 10px;
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .stat .label {
        color: #e3f2fd;
        font-size: 14px;
    }

    .stat .value {
        color: #fff;
        font-size: 18px;
        font-weight: bold;
    }

    .notification {
        animation: slideIn 0.3s ease;
    }

    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }

    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }

    .no-results {
        text-align: center;
        padding: 50px;
        color: #666;
        font-size: 18px;
        background: #f5f5f5;
        border-radius: 10px;
        margin: 20px 0;
    }

    .results-header {
        text-align: center;
        margin-bottom: 30px;
        padding: 30px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border-radius: 15px;
        box-shadow: 0 10px 30px rgba(102, 126, 234, 0.3);
    }

    .results-header h2 {
        margin: 0 0 15px 0;
        font-size: 28px;
        font-weight: bold;
    }

    .results-summary {
        font-size: 18px;
        opacity: 0.9;
    }

    /* تحسينات للشاشات الصغيرة */
    @media (max-width: 768px) {
        .coin-card.enhanced {
            margin-bottom: 20px;
        }

        .coin-header {
            flex-direction: column;
            gap: 15px;
            text-align: center;
        }

        .coin-price {
            justify-content: center;
        }

        .levels-grid, .targets-grid, .entry-exit-grid {
            grid-template-columns: 1fr;
        }

        .indicator-row {
            grid-template-columns: repeat(2, 1fr);
        }

        .action-buttons {
            flex-direction: column;
        }

        .btn-primary, .btn-secondary, .btn-info {
            min-width: auto;
        }

        .confidence-risk {
            grid-template-columns: 1fr;
        }

        .summary-stats {
            grid-template-columns: 1fr;
        }

        .tp-levels {
            grid-template-columns: repeat(2, 1fr);
        }
    }

    @media (max-width: 480px) {
        .results-header {
            padding: 20px;
        }

        .results-header h2 {
            font-size: 24px;
        }

        .coin-info h3 {
            font-size: 20px;
        }

        .price {
            font-size: 16px;
        }

        .indicator-row {
            grid-template-columns: 1fr;
        }

        .tp-levels {
            grid-template-columns: 1fr;
        }
    }
`;

// إضافة CSS المحسن إلى الصفحة
function addEnhancedCSS() {
    const styleElement = document.createElement('style');
    styleElement.textContent = enhancedCSS;
    document.head.appendChild(styleElement);
}

// تهيئة التطبيق
document.addEventListener('DOMContentLoaded', function() {
    addEnhancedCSS();
    
    // إنشاء مثيل من محلل العملات المحسن
    window.cryptoAnalyzer = new CryptoAnalyzer();
    
    // ربط الأحداث
    const analyzeBtn = document.getElementById('analyzeBtn');
    if (analyzeBtn) {
        analyzeBtn.addEventListener('click', () => {
            window.cryptoAnalyzer.startAnalysis();
        });
    }

    // إضافة مؤشر التحميل المحسن
    const loadingHTML = `
        <div id="loadingIndicator" class="loading-indicator" style="display: none;">
            <div class="loading-content">
                <div class="loading-spinner"></div>
                <div class="loading-text">جاري تحليل العملات الرقمية...</div>
                <div class="loading-progress">
                    <div class="progress-bar">
                        <div class="progress-fill"></div>
                    </div>
                    <div class="progress-text">0%</div>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', loadingHTML);
    
    console.log('🚀 تم تحميل محلل العملات الرقمية المتقدم بنجاح!');
});

// تصدير الكلاس للاستخدام العام
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CryptoAnalyzer;
}


