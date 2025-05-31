
class CryptoAnalyzer {
    constructor() {
        this.coins = [];
        this.isLoading = false;
        this.lastUpdate = null;
        this.config = {
            UPDATE_INTERVAL: 300000, // 5 دقائق
            MAX_COINS: 20,
            API_BASE: 'https://www.okx.com/api/v5'
        };
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.startAnalysis();
        this.startCountdown();
    }

    setupEventListeners() {
        const modal = document.getElementById('coinModal');
        const closeBtn = document.querySelector('.close');
        
        closeBtn.onclick = () => modal.style.display = 'none';
        window.onclick = (event) => {
            if (event.target === modal) {
                modal.style.display = 'none';
            }
        };
    }

    async startAnalysis() {
        if (this.isLoading) return;
        
        this.isLoading = true;
        this.showLoading(true);
        
        try {
            await this.fetchAndAnalyzeCoins();
            this.renderCoins();
            this.updateStats();
            this.updateLastUpdateTime();
            this.showNotification('تم تحديث البيانات بنجاح!', 'success');
        } catch (error) {
            console.error('خطأ في التحليل:', error);
            this.showError('حدث خطأ في تحليل العملات. سيتم المحاولة مرة أخرى.');
        } finally {
            this.isLoading = false;
            this.showLoading(false);
            this.scheduleNextUpdate();
        }
    }

    async fetchAndAnalyzeCoins() {
        console.log('🔄 جاري جلب البيانات الحقيقية من OKX...');
        
        // جلب البيانات الحقيقية من OKX
        const realData = await this.fetchRealDataFromOKX();
        
        // تحليل كل عملة
        const analyzedCoins = [];
        for (const coinData of realData) {
            try {
                const analysis = await this.analyzeCoinWithRealData(coinData);
                if (analysis && analysis.score >= 50) {
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
            
        console.log(`✅ تم تحليل ${this.coins.length} عملة بنجاح`);
    }

    async fetchRealDataFromOKX() {
        try {
            console.log('📡 جاري الاتصال بـ OKX API...');
            
            // جلب جميع أزواج التداول النشطة
            const instrumentsUrl = `${CONFIG.OKX_API.BASE_URL}/public/instruments?instType=SPOT`;
            const instrumentsResponse = await fetch(instrumentsUrl);
            
            if (!instrumentsResponse.ok) {
                throw new Error(`HTTP Error: ${instrumentsResponse.status}`);
            }
            
            const instrumentsData = await instrumentsResponse.json();
            
            if (instrumentsData.code !== '0') {
                throw new Error(`OKX API Error: ${instrumentsData.msg}`);
            }
            
            // تصفية العملات المطلوبة
            const validInstruments = instrumentsData.data.filter(inst => 
                inst.quoteCcy === CONFIG.FILTERS.QUOTE_CURRENCY &&
                !CONFIG.FILTERS.EXCLUDED_SYMBOLS.includes(inst.baseCcy) &&
                inst.state === 'live'
            );
            
            console.log(`📊 تم العثور على ${validInstruments.length} زوج تداول صالح`);
            
            // جلب بيانات السوق لكل عملة
            const marketData = [];
            const batchSize = 20; // معالجة 20 عملة في كل مرة
            
            for (let i = 0; i < Math.min(validInstruments.length, 200); i += batchSize) {
                const batch = validInstruments.slice(i, i + batchSize);
                const batchPromises = batch.map(inst => this.fetchCoinMarketData(inst));
                
                const batchResults = await Promise.allSettled(batchPromises);
                
                batchResults.forEach(result => {
                    if (result.status === 'fulfilled' && result.value) {
                        marketData.push(result.value);
                    }
                });
                
                // تأخير بين الدفعات لتجنب تجاوز حدود API
                if (i + batchSize < validInstruments.length) {
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
            }
            
            // تصفية البيانات النهائية
            const filteredData = marketData.filter(coin => 
                coin && 
                coin.volume24h >= CONFIG.FILTERS.MIN_VOLUME &&
                coin.price > 0 &&
                !isNaN(coin.price) &&
                !isNaN(coin.volume24h)
            );
            
            console.log(`✅ تم جلب بيانات ${filteredData.length} عملة صالحة`);
            return filteredData;
            
        } catch (error) {
            console.error('❌ خطأ في جلب البيانات من OKX:', error);
            throw new Error(`فشل في الاتصال بـ OKX API: ${error.message}`);
        }
    }

   async fetchCoinMarketData(instrument) {
    const timestamp = new Date().toISOString();
    const method = 'GET';
    const requestPath = `/api/v5/market/ticker?instId=${instrument}`;
    
    const signature = await this.generateSignature(timestamp, method, requestPath);
    
    const headers = {
        'OK-ACCESS-KEY': OKX_CONFIG.API_KEY,
        'OK-ACCESS-SIGN': signature,
        'OK-ACCESS-TIMESTAMP': timestamp,
        'OK-ACCESS-PASSPHRASE': OKX_CONFIG.PASSPHRASE,
        'Content-Type': 'application/json'
    };
    
    try {
        const response = await fetch(`${OKX_CONFIG.BASE_URL}${requestPath}`, {
            method: 'GET',
            headers: headers
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.code !== '0') {
            throw new Error(`OKX API Error: ${data.msg}`);
        }
        
        return data;
        
    } catch (error) {
        console.error(`خطأ في جلب بيانات ${instrument}:`, error);
        
        // إعادة المحاولة مرة واحدة بعد تأخير
        await this.delay(1000);
        return this.fetchCoinMarketDataFallback(instrument);
    }
}
async fetchCoinMarketDataFallback(instrument) {
    // استخدام API عام بدون مصادقة كخطة بديلة
    try {
        const response = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${instrument}`);
        return await response.json();
    } catch (error) {
        console.error(`فشل في جلب البيانات نهائياً لـ ${instrument}`);
        return null;
    }
}


    async analyzeCoinWithRealData(coinData) {
        try {
            let score = 0;
            const indicators = {};
            
            // جلب بيانات الشموع للتحليل الفني
            const candleData = await this.fetchCandleData(coinData.instId);
            if (!candleData || candleData.length < 50) {
                console.warn(`بيانات شموع غير كافية لـ ${coinData.symbol}`);
                return null;
            }
            
            // 1. تحليل RSI الحقيقي
            const rsi = this.calculateRealRSI(candleData);
            indicators.rsi = rsi;
            if (rsi > CONFIG.INDICATORS.RSI.BREAKOUT_LEVEL && rsi < 70) {
                score += CONFIG.SCORING.RSI_BREAKOUT;
                indicators.rsiSignal = 'اختراق صعودي';
            }
            
            // 2. تحليل MACD الحقيقي
            const macd = this.calculateRealMACD(candleData);
            indicators.macd = macd;
            if (macd.signal === 'bullish' || macd.histogram > 0) {
                score += CONFIG.SCORING.MACD_SIGNAL;
                indicators.macdSignal = 'إشارة صعودية';
            }
            
            // 3. تحليل المتوسط المتحرك الحقيقي
            const sma = this.calculateRealSMA(candleData);
            indicators.sma = sma;
            if (coinData.price > sma) {
                score += CONFIG.SCORING.SMA_BREAKOUT;
                indicators.smaSignal = 'فوق المتوسط المتحرك';
            }
            
            // 4. تحليل المقاومة الحقيقي
            const resistance = this.calculateRealResistance(candleData);
            indicators.resistance = resistance;
            if (coinData.price >= resistance * 0.98) {
                score += CONFIG.SCORING.RESISTANCE_BREAK;
                indicators.resistanceSignal = 'اقتراب من المقاومة';
            }
            
            // 5. مؤشر السيولة الحقيقي
            const liquidity = this.calculateRealLiquidity(candleData);
            indicators.liquidity = liquidity;
            if (liquidity > 0) {
                score += CONFIG.SCORING.LIQUIDITY_CROSS;
                indicators.liquiditySignal = 'تقاطع صعودي';
            }
            
            // 6. تحليل حجم التداول الحقيقي
            const volumeAnalysis = this.calculateRealVolumeIncrease(candleData);
            indicators.volumeIncrease = volumeAnalysis.increase;
            if (volumeAnalysis.increase > 20) {
                score += CONFIG.SCORING.VOLUME_INCREASE;
                indicators.volumeSignal = `زيادة ${volumeAnalysis.increase.toFixed(1)}%`;
            }
            
            // 7. قوة الاتجاه الحقيقية
            const trendStrength = this.calculateRealTrendStrength(candleData);
            indicators.trendStrength = trendStrength;
            if (trendStrength > 60) {
                score += CONFIG.SCORING.TREND_STRENGTH;
                indicators.trendSignal = 'اتجاه قوي';
            }
            
   // دالة حساب الدعم والمقاومة المُصححة
calculateRealSupportResistanceLevels(candleData) {
    const closes = candleData.map(candle => parseFloat(candle[4]));
    const highs = candleData.map(candle => parseFloat(candle[2]));
    const lows = candleData.map(candle => parseFloat(candle[3]));
    
    const currentPrice = closes[closes.length - 1];
    const high24h = Math.max(...highs.slice(-24));
    const low24h = Math.min(...lows.slice(-24));
    
    // حساب مستويات الدعم والمقاومة
    const supports = [];
    const resistances = [];
    
    for (let i = 1; i < closes.length - 1; i++) {
        if (closes[i] < closes[i-1] && closes[i] < closes[i+1]) {
            if (closes[i] < currentPrice) supports.push(closes[i]);
        }
        if (closes[i] > closes[i-1] && closes[i] > closes[i+1]) {
            if (closes[i] > currentPrice) resistances.push(closes[i]);
        }
    }
    
    supports.sort((a, b) => b - a);
    resistances.sort((a, b) => a - b);
    
    let support1 = supports.length > 0 ? supports[0] : currentPrice * 0.95;
    let support2 = supports.length > 1 ? supports[1] : currentPrice * 0.90;
    let resistance1 = resistances.length > 0 ? resistances[0] : currentPrice * 1.05;
    let resistance2 = resistances.length > 1 ? resistances[1] : currentPrice * 1.15;
    
    // التأكد من الترتيب الصحيح
    if (support1 >= currentPrice) support1 = currentPrice * 0.95;
    if (support2 >= support1) support2 = support1 * 0.95;
    if (resistance1 <= currentPrice) resistance1 = currentPrice * 1.05;
    if (resistance2 <= resistance1) resistance2 = resistance1 * 1.05;
    
    return {
        support1,
        support2,
        resistance1,
        resistance2,
        pivot: (high24h + low24h + currentPrice) / 3
    };
}

    async fetchCandleData(instId, timeframe = '1H', limit = 100) {
        try {
            const candleUrl = `${CONFIG.OKX_API.BASE_URL}/market/candles?instId=${instId}&bar=${timeframe}&limit=${limit}`;
            const response = await fetch(candleUrl);
            
            if (!response.ok) {
                throw new Error(`HTTP Error: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.code !== '0' || !data.data.length) {
                throw new Error('لا توجد بيانات شموع');
            }
            
            return data.data.map(candle => ({
                timestamp: parseInt(candle[0]),
                open: parseFloat(candle[1]),
                high: parseFloat(candle[2]),
                low: parseFloat(candle[3]),
                close: parseFloat(candle[4]),
                volume: parseFloat(candle[5]),
                volumeQuote: parseFloat(candle[6])
            })).reverse(); // ترتيب من الأقدم للأحدث
            
        } catch (error) {
            console.warn(`خطأ في جلب بيانات الشموع لـ ${instId}:`, error.message);
            return null;
        }
    }

    calculateRealRSI(candles, period = 14) {
        if (candles.length < period + 1) return 50;
        
        let gains = [];
        let losses = [];
        
        // حساب التغييرات
        for (let i = 1; i < candles.length; i++) {
            const change = candles[i].close - candles[i - 1].close;
            gains.push(change > 0 ? change : 0);
            losses.push(change < 0 ? Math.abs(change) : 0);
        }
        
        // حساب المتوسط المتحرك للمكاسب والخسائر
        let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
        let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
        
        // حساب RSI للفترات المتبقية
        for (let i = period; i < gains.length; i++) {
            avgGain = (avgGain * (period - 1) + gains[i]) / period;
            avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
        }
        
        if (avgLoss === 0) return 100;
        
        const rs = avgGain / avgLoss;
        return 100 - (100 / (1 + rs));
    }
    calculateRealMACD(candles, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
        if (candles.length < slowPeriod + signalPeriod) return { value: 0, signal: 'neutral', histogram: 0 };
        
        const prices = candles.map(c => c.close);
        
        // حساب EMA السريع والبطيء
        const emaFast = this.calculateEMA(prices, fastPeriod);
        const emaSlow = this.calculateEMA(prices, slowPeriod);
        
        // حساب خط MACD
        const macdLine = [];
        for (let i = slowPeriod - 1; i < prices.length; i++) {
            macdLine.push(emaFast[i] - emaSlow[i]);
        }
        
        // حساب خط الإشارة
        const signalLine = this.calculateEMA(macdLine, signalPeriod);
        
        const currentMacd = macdLine[macdLine.length - 1];
        const currentSignal = signalLine[signalLine.length - 1];
        const histogram = currentMacd - currentSignal;
        
        // تحديد الإشارة
        let signal = 'neutral';
        if (histogram > 0 && macdLine[macdLine.length - 2] <= signalLine[signalLine.length - 2]) {
            signal = 'bullish'; // تقاطع صعودي
        } else if (histogram < 0 && macdLine[macdLine.length - 2] >= signalLine[signalLine.length - 2]) {
            signal = 'bearish'; // تقاطع هبوطي
        } else if (histogram > 0) {
            signal = 'bullish';
        } else if (histogram < 0) {
            signal = 'bearish';
        }
        
        return {
            value: currentMacd,
            signal: signal,
            histogram: histogram,
            signalLine: currentSignal
        };
    }

    calculateEMA(prices, period) {
        const ema = [];
        const multiplier = 2 / (period + 1);
        
        // أول قيمة هي SMA
        let sum = 0;
        for (let i = 0; i < period && i < prices.length; i++) {
            sum += prices[i];
        }
        ema[period - 1] = sum / Math.min(period, prices.length);
        
        // باقي القيم
        for (let i = period; i < prices.length; i++) {
            ema[i] = (prices[i] * multiplier) + (ema[i - 1] * (1 - multiplier));
        }
        
        return ema;
    }

    calculateRealSMA(candles, period = 20) {
        if (candles.length < period) return candles[candles.length - 1].close;
        
        const recentPrices = candles.slice(-period).map(c => c.close);
        return recentPrices.reduce((sum, price) => sum + price, 0) / period;
    }

    calculateRealResistance(candles) {
        // البحث عن أعلى القمم في آخر 50 شمعة
        const recentCandles = candles.slice(-50);
        const highs = recentCandles.map(c => c.high);
        
        // ترتيب القمم وأخذ أعلى 5 قيم
        const topHighs = [...highs].sort((a, b) => b - a).slice(0, 5);
        
        // حساب متوسط أعلى القمم كمقاومة
        return topHighs.reduce((sum, high) => sum + high, 0) / topHighs.length;
    }

    calculateRealLiquidity(candles) {
        // حساب مؤشر السيولة بناءً على العلاقة بين السعر والحجم
        if (candles.length < 10) return 0;
        
        const recent = candles.slice(-10);
        let liquidityScore = 0;
        
        for (let i = 1; i < recent.length; i++) {
            const priceChange = recent[i].close - recent[i - 1].close;
            const volumeRatio = recent[i].volume / recent[i - 1].volume;
            
            // إذا ارتفع السعر مع زيادة الحجم = إيجابي
            if (priceChange > 0 && volumeRatio > 1) {
                liquidityScore += 1;
            } else if (priceChange < 0 && volumeRatio > 1) {
                liquidityScore -= 1;
            }
        }
        
        return liquidityScore / (recent.length - 1);
    }

    calculateRealVolumeIncrease(candles) {
        if (candles.length < 8) return { increase: 0, current: 0, average: 0 };
        
        // آخر 4 ساعات مقابل 4 ساعات قبلها
        const recent4h = candles.slice(-4);
        const previous4h = candles.slice(-8, -4);
        
        const recentVolume = recent4h.reduce((sum, c) => sum + c.volume, 0);
        const previousVolume = previous4h.reduce((sum, c) => sum + c.volume, 0);
        
        const increase = previousVolume > 0 ? ((recentVolume - previousVolume) / previousVolume) * 100 : 0;
        
        return {
            increase: increase,
            current: recentVolume,
            average: previousVolume
        };
    }

    calculateRealTrendStrength(candles) {
        if (candles.length < 20) return 0;
        
        const recent = candles.slice(-20);
        const prices = recent.map(c => c.close);
        
        // حساب الاتجاه العام
        let upMoves = 0;
        let downMoves = 0;
        let totalMoves = 0;
        
        for (let i = 1; i < prices.length; i++) {
            const change = prices[i] - prices[i - 1];
            const changePercent = Math.abs(change / prices[i - 1]) * 100;
            
            if (changePercent > 0.1) { // تجاهل التحركات الصغيرة
                totalMoves++;
                if (change > 0) {
                    upMoves++;
                } else {
                    downMoves++;
                }
            }
        }
        
        if (totalMoves === 0) return 0;
        
        // حساب قوة الاتجاه
        const trendDirection = upMoves > downMoves ? 'up' : 'down';
        const dominantMoves = Math.max(upMoves, downMoves);
        const strength = (dominantMoves / totalMoves) * 100;
        
        // إضافة وزن للحجم
        const avgVolume = recent.reduce((sum, c) => sum + c.volume, 0) / recent.length;
        const recentVolume = recent.slice(-5).reduce((sum, c) => sum + c.volume, 0) / 5;
        const volumeBoost = recentVolume > avgVolume ? 1.2 : 1;
        
        return Math.min(strength * volumeBoost, 100);
    }

    calculateRealSupportResistanceLevels(candles) {
        if (candles.length < 50) {
            const currentPrice = candles[candles.length - 1].close;
            return {
                support1: currentPrice * 0.95,
                support2: currentPrice * 0.90,
                resistance1: currentPrice * 1.05,
                resistance2: currentPrice * 1.10,
                pivot: currentPrice
            };
        }
        
        const recent = candles.slice(-50);
        const highs = recent.map(c => c.high);
        const lows = recent.map(c => c.low);
        const closes = recent.map(c => c.close);
        
        // البحث عن مستويات الدعم (القيعان)
        const supports = [];
        for (let i = 2; i < lows.length - 2; i++) {
            if (lows[i] <= lows[i-1] && lows[i] <= lows[i+1] && 
                lows[i] <= lows[i-2] && lows[i] <= lows[i+2]) {
                supports.push(lows[i]);
            }
        }
        
        // البحث عن مستويات المقاومة (القمم)
        const resistances = [];
        for (let i = 2; i < highs.length - 2; i++) {
            if (highs[i] >= highs[i-1] && highs[i] >= highs[i+1] && 
                highs[i] >= highs[i-2] && highs[i] >= highs[i+2]) {
                resistances.push(highs[i]);
            }
        }
        
        // ترتيب وأخذ أقرب المستويات
        supports.sort((a, b) => b - a); // من الأعلى للأقل
        resistances.sort((a, b) => a - b); // من الأقل للأعلى
        
        const currentPrice = closes[closes.length - 1];
        const high24h = Math.max(...highs.slice(-24));
        const low24h = Math.min(...lows.slice(-24));
        
        return {
            support1: supports.length > 0 ? supports[0] : low24h,
            support2: supports.length > 1 ? supports[1] : low24h * 0.95,
            resistance1: resistances.length > 0 ? resistances[0] : high24h,
            resistance2: resistances.length > 1 ? resistances[1] : high24h * 1.05,
            pivot: (high24h + low24h + currentPrice) / 3
        };
    }

  // دالة حساب الأهداف المُصححة
    calculatePriceTargets(coinData, levels) {
        const currentPrice = coinData.price;
        
        const target1 = currentPrice * 1.05;
        const target2 = currentPrice * 1.10;
        const target3 = currentPrice * 1.15;
        const longTerm = Math.max(
            currentPrice * 1.35,
            target3 * 1.20,
            levels.resistance2 || currentPrice * 1.40
        );
        
        return { target1, target2, target3, longTerm };
    }

    // دالة التحقق الشامل
    validateAllData(coinData) {
        const { price, levels, targets, entryExit } = coinData;
        
        // تحقق منطقي
        if (levels.support1 >= price) levels.support1 = price * 0.95;
        if (levels.resistance1 <= price) levels.resistance1 = price * 1.05;
        if (entryExit.stopLoss >= price) entryExit.stopLoss = price * 0.95;
        if (targets.longTerm <= targets.target3) targets.longTerm = targets.target3 * 1.20;
        
        return coinData;
    }
}

  // دالة حساب نقطة الدخول المُصححة
    calculateEntryExit(coinData, levels) {
        const currentPrice = coinData.price;
        const entryPoint = Math.max(currentPrice * 1.02, levels.resistance1 * 0.99);
        const stopLoss = Math.min(levels.support1, currentPrice * 0.95);
        
        return {
            entryPoint,
            stopLoss
        };
    }

    generateAnalysis(coinData, indicators, score) {
        let analysis = '';
        
        if (score >= 80) {
            analysis = `🚀 إشارة قوية جداً للشراء. العملة تظهر اختراقات فنية متعددة مع حجم تداول مرتفع.`;
        } else if (score >= 65) {
            analysis = `📈 إشارة جيدة للشراء. المؤشرات الفنية تدعم الاتجاه الصعودي.`;
        } else if (score >= 50) {
            analysis = `⚡ إشارة متوسطة. يُنصح بالمراقبة والدخول عند تأكيد الإشارات.`;
        } else {
            analysis = `⚠️ إشارة ضعيفة. لا يُنصح بالدخول حالياً.`;
        }
        
        // إضافة تفاصيل المؤشرات
        if (indicators.rsiSignal) analysis += ` مؤشر RSI (${indicators.rsi.toFixed(1)}) يظهر ${indicators.rsiSignal}.`;
        if (indicators.macdSignal) analysis += ` MACD يعطي ${indicators.macdSignal}.`;
        if (indicators.volumeSignal) analysis += ` حجم التداول يظهر ${indicators.volumeSignal}.`;
        
        return analysis;
    }

    renderCoins() {
        const grid = document.getElementById('coinsGrid');
        grid.innerHTML = '';
        
        if (this.coins.length === 0) {
            grid.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 40px;">
                    <h3>لا توجد عملات تحقق الشروط المطلوبة حالياً</h3>
                    <p>سيتم البحث مرة أخرى في التحديث القادم</p>
                </div>
            `;
            return;
        }
        
        this.coins.forEach((coin, index) => {
            const card = this.createCoinCard(coin, index + 1);
            grid.appendChild(card);
        });
        
        grid.classList.add('fade-in');
        this.addVisualEffects();
    }

    createCoinCard(coin, rank) {
        const card = document.createElement('div');
        card.className = 'coin-card';
        card.onclick = () => this.showCoinDetails(coin);
        
        const changeClass = coin.change24h >= 0 ? 'positive' : 'negative';
        const changeSymbol = coin.change24h >= 0 ? '+' : '';
        
        // إضافة معلومات التحديث
        const lastUpdate = new Date(coin.lastAnalysis || coin.timestamp).toLocaleTimeString('ar-SA');
        
        card.innerHTML = `
            <div class="coin-header">
                <div class="coin-logo">
                    <span>${coin.symbol.charAt(0)}</span>
                </div>
                <div class="coin-name">
                    <h3>${coin.symbol}</h3>
                    <span class="rank">المركز ${rank}</span>
                    <small style="color: #666; font-size: 10px;">آخر تحليل: ${lastUpdate}</small>
                </div>
                <div class="coin-score">
                    ${coin.score.toFixed(0)}
                </div>
            </div>
            
            <div class="coin-details">
                <div class="detail-item">
                    <div class="label">السعر الحالي</div>
                    <div class="value price">$${this.formatNumber(coin.price)}</div>
                </div>
                <div class="detail-item">
                    <div class="label">التغيير 24س</div>
                    <div class="value change ${changeClass}">
                        ${changeSymbol}${coin.change24h.toFixed(2)}%
                    </div>
                </div>
                <div
                <div class="detail-item">
                    <div class="label">حجم التداول</div>
                    <div class="value volume">$${this.formatVolume(coin.volume24h)}</div>
                </div>
                <div class="detail-item">
                    <div class="label">RSI</div>
                    <div class="value">${coin.indicators.rsi ? coin.indicators.rsi.toFixed(1) : 'N/A'}</div>
                </div>
            </div>
            
            <div class="indicators">
                ${this.renderIndicators(coin.indicators)}
            </div>
            
            <div class="real-data-badge">
                <span>📡 بيانات حقيقية من OKX</span>
            </div>
        `;
        
        return card;
    }

    renderIndicators(indicators) {
        let html = '';
        
        if (indicators.rsiSignal) {
            html += `<span class="indicator strong">RSI: ${indicators.rsiSignal}</span>`;
        }
        if (indicators.macdSignal) {
            html += `<span class="indicator strong">MACD: ${indicators.macdSignal}</span>`;
        }
        if (indicators.smaSignal) {
            html += `<span class="indicator">SMA: ${indicators.smaSignal}</span>`;
        }
        if (indicators.volumeSignal) {
            html += `<span class="indicator">الحجم: ${indicators.volumeSignal}</span>`;
        }
        if (indicators.trendSignal) {
            html += `<span class="indicator">الاتجاه: ${indicators.trendSignal}</span>`;
        }
        
        return html;
    }

    showCoinDetails(coin) {
        const modal = document.getElementById('coinModal');
        
        // تحديث معلومات الرأس
        document.getElementById('modalCoinSymbol').textContent = coin.symbol.charAt(0);
        document.getElementById('modalCoinName').textContent = `${coin.symbol}/USDT`;
        document.getElementById('modalCoinPrice').textContent = `$${this.formatNumber(coin.price)}`;
        document.getElementById('modalCoinScore').textContent = coin.score.toFixed(0);
        
        // التحليل الفني
        document.getElementById('technicalAnalysis').innerHTML = `
            <p>${coin.analysis}</p>
            <div class="analysis-details">
                <h4>تفاصيل التحليل الفني:</h4>
                <ul>
                    <li><strong>RSI:</strong> ${coin.indicators.rsi ? coin.indicators.rsi.toFixed(2) : 'غير متوفر'} ${coin.indicators.rsiSignal ? `(${coin.indicators.rsiSignal})` : ''}</li>
                    <li><strong>MACD:</strong> ${coin.indicators.macd ? coin.indicators.macd.value.toFixed(4) : 'غير متوفر'} ${coin.indicators.macdSignal ? `(${coin.indicators.macdSignal})` : ''}</li>
                    <li><strong>المتوسط المتحرك:</strong> $${coin.indicators.sma ? this.formatNumber(coin.indicators.sma) : 'غير متوفر'}</li>
                    <li><strong>قوة الاتجاه:</strong> ${coin.indicators.trendStrength ? coin.indicators.trendStrength.toFixed(1) + '%' : 'غير متوفر'}</li>
                    <li><strong>زيادة الحجم:</strong> ${coin.indicators.volumeIncrease ? coin.indicators.volumeIncrease.toFixed(1) + '%' : 'غير متوفر'}</li>
                </ul>
            </div>
        `;
        
        // المستويات الحرجة
        document.getElementById('supportLevel').textContent = `$${this.formatNumber(coin.levels.support1)}`;
        document.getElementById('resistanceLevel').textContent = `$${this.formatNumber(coin.levels.resistance1)}`;
        document.getElementById('entryPoint').textContent = `$${this.formatNumber(coin.entryExit.entryPoint)}`;
        document.getElementById('stopLoss').textContent = `$${this.formatNumber(coin.entryExit.stopLoss)}`;
        
        // الأهداف السعرية
        document.getElementById('priceTargets').innerHTML = `
            <div class="target">الهدف الأول: $${this.formatNumber(coin.targets.target1)} (+5%)</div>
            <div class="target">الهدف الثاني: $${this.formatNumber(coin.targets.target2)} (+10%)</div>
            <div class="target">الهدف الثالث: $${this.formatNumber(coin.targets.target3)} (+15%)</div>
            <div class="target">الهدف طويل المدى: $${this.formatNumber(coin.targets.longTerm)}</div>
        `;
        
        // المؤشرات التفصيلية
        document.getElementById('indicatorsDetail').innerHTML = this.renderDetailedIndicators(coin.indicators);
        
        modal.style.display = 'block';
    }

    renderDetailedIndicators(indicators) {
        return `
            <div class="indicator-item">
                <h4>مؤشر القوة النسبية (RSI)</h4>
                <div class="indicator-value ${this.getRSIClass(indicators.rsi)}">
                    ${indicators.rsi ? indicators.rsi.toFixed(2) : 'غير متوفر'}
                </div>
                <small>${this.getRSIDescription(indicators.rsi)}</small>
            </div>
            <div class="indicator-item">
                <h4>MACD</h4>
                <div class="indicator-value ${indicators.macd && indicators.macd.signal === 'bullish' ? 'bullish' : 'bearish'}">
                    ${indicators.macd ? indicators.macd.value.toFixed(4) : 'غير متوفر'}
                </div>
                <small>الإشارة: ${indicators.macd ? (indicators.macd.signal === 'bullish' ? 'صعودية' : indicators.macd.signal === 'bearish' ? 'هبوطية' : 'محايدة') : 'غير متوفرة'}</small>
            </div>
            <div class="indicator-item">
                <h4>المتوسط المتحرك البسيط (20)</h4>
                <div class="indicator-value ${indicators.sma ? 'bullish' : 'neutral'}">
                    $${indicators.sma ? this.formatNumber(indicators.sma) : 'غير متوفر'}
                </div>
                <small>${indicators.smaSignal || 'لا توجد إشارة'}</small>
            </div>
            <div class="indicator-item">
                <h4>قوة الاتجاه</h4>
                <div class="indicator-value ${this.getTrendClass(indicators.trendStrength)}">
                    ${indicators.trendStrength ? indicators.trendStrength.toFixed(1) + '%' : 'غير متوفر'}
                </div>
                <small>${this.getTrendDescription(indicators.trendStrength)}</small>
            </div>
            <div class="indicator-item">
                <h4>مؤشر السيولة</h4>
                <div class="indicator-value ${indicators.liquidity > 0 ? 'bullish' : indicators.liquidity < 0 ? 'bearish' : 'neutral'}">
                    ${indicators.liquidity ? indicators.liquidity.toFixed(2) : 'غير متوفر'}
                </div>
                <small>${indicators.liquiditySignal || 'لا توجد إشارة'}</small>
            </div>
            <div class="indicator-item">
                <h4>زيادة الحجم (4 ساعات)</h4>
                <div class="indicator-value ${indicators.volumeIncrease > 20 ? 'bullish' : indicators.volumeIncrease > 0 ? 'neutral' : 'bearish'}">
                    ${indicators.volumeIncrease ? (indicators.volumeIncrease > 0 ? '+' : '') + indicators.volumeIncrease.toFixed(1) + '%' : 'غير متوفر'}
                </div>
                <small>${indicators.volumeSignal || 'لا توجد إشارة'}</small>
            </div>
        `;
    }

    getRSIClass(rsi) {
        if (!rsi) return 'neutral';
        if (rsi >= 70) return 'bearish'; // ذروة شراء
        if (rsi <= 30) return 'bullish'; // ذروة بيع
        if (rsi > 50) return 'bullish';
        return 'bearish';
    }

    getRSIDescription(rsi) {
        if (!rsi) return 'غير متوفر';
        if (rsi >= 70) return 'ذروة شراء - احتمال تصحيح';
        if (rsi <= 30) return 'ذروة بيع - فرصة شراء';
        if (rsi > 50) return 'منطقة صعودية';
        return 'منطقة هبوطية';
    }

    getTrendClass(strength) {
        if (!strength) return 'neutral';
        if (strength >= 70) return 'bullish';
        if (strength >= 40) return 'neutral';
        return 'bearish';
    }

    getTrendDescription(strength) {
        if (!strength) return 'غير متوفر';
        if (strength >= 70) return 'اتجاه قوي جداً';
        if (strength >= 40) return 'اتجاه متوسط';
        return 'اتجاه ضعيف';
    }

    updateStats() {
        const totalCoins = this.coins.length;
        const avgScore = totalCoins > 0 ? 
            this.coins.reduce((sum, coin) => sum + coin.score, 0) / totalCoins : 0;
        const topCoin = totalCoins > 0 ? this.coins[0].symbol : '--';
        
        document.getElementById('totalCoins').textContent = totalCoins;
        document.getElementById('avgScore').textContent = avgScore.toFixed(1);
        document.getElementById('topCoin').textContent = topCoin;
        
        // إضافة إحصائيات إضافية
        const highScoreCoins = this.coins.filter(coin => coin.score >= 80).length;
        const mediumScoreCoins = this.coins.filter(coin => coin.score >= 65 && coin.score < 80).length;
        
        // تحديث شريط الحالة
        const statusBar = document.querySelector('.status-bar');
        if (statusBar) {
            statusBar.innerHTML = `
                <div class="status-item">
                    <span class="status-label">إشارات قوية:</span>
                    <span class="status-value strong">${highScoreCoins}</span>
                </div>
                <div class="status-item">
                    <span class="status-label">إشارات جيدة:</span>
                    <span class="status-value medium">${mediumScoreCoins}</span>
                </div>
                <div class="status-item">
                    <span class="status-label">مصدر البيانات:</span>
                    <span class="status-value">OKX API 📡</span>
                </div>
            `;
        }
    }

    updateLastUpdateTime() {
        const now = new Date();
        const timeString = now.toLocaleTimeString('ar-SA', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        const dateString = now.toLocaleDateString('ar-SA');
        document.getElementById('lastUpdate').textContent = `آخر تحديث: ${timeString} - ${dateString}`;
    }

    startCountdown() {
        let timeLeft = CONFIG.UPDATE_INTERVAL / 1000;
        
        this.countdownTimer = setInterval(() => {
            const minutes = Math.floor(timeLeft / 60);
            const seconds = timeLeft % 60;
            
            document.getElementById('countdown').textContent = 
                `التحديث القادم خلال: ${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            
            timeLeft--;
            
            if (timeLeft < 0) {
                timeLeft = CONFIG.UPDATE_INTERVAL / 1000;
            }
        }, 1000);
    }

    scheduleNextUpdate() {
        if (this.updateTimer) {
            clearTimeout(this.updateTimer);
        }
        
        this.updateTimer = setTimeout(() => {
            console.log('🔄 بدء التحديث التلقائي...');
            this.startAnalysis();
        }, CONFIG.UPDATE_INTERVAL);
    }

    showLoading(show) {
        const loading = document.getElementById('loading');
        const grid = document.getElementById('coinsGrid');
        
        if (show) {
            loading.classList.remove('hidden');
            grid.classList.add('hidden');
            loading.innerHTML = `
                <div class="loading-content">
                    <div class="spinner"></div>
                    <h3>جاري تحليل العملات الرقمية...</h3>
                    <p>📡 جلب البيانات الحقيقية من OKX</p>
                    <p>📊 تحليل المؤشرات الفنية</p>
                    <p>🎯 حساب نقاط التداول</p>
                </div>
            `;
        } else {
            loading.classList.add('hidden');
            grid.classList.remove('hidden');
        }
    }

    showError(message) {
        const container = document.querySelector('.container');
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.innerHTML = `
            <span>❌ ${message}</span>
            <button onclick="this.parentElement.remove()">×</button>
        `;
        
        container.insertBefore(errorDiv, container.firstChild);
        
        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.remove();
            }
        }, 10000);
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <span>${message}</span>
            <button onclick="this.parentElement.remove()">×</button>
        `;
        
        const bgColor = type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3';
        
        notification.style.cssText = `
            position: fixed;
                        top: 20px;
            right: 20px;
            background: ${bgColor};
            color: white;
            padding: 15px 20px;
            border-radius: 10px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            z-index: 10000;
            display: flex;
            align-items: center;
            gap: 10px;
            max-width: 300px;
            animation: slideInRight 0.3s ease;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 5000);
    }

    addVisualEffects() {
        // تأثير النبض للعملات عالية النقاط
        this.coins.forEach((coin, index) => {
            const card = document.querySelectorAll('.coin-card')[index];
            if (!card) return;
            
            // إزالة التأثيرات السابقة
            card.classList.remove('pulse', 'glow-strong', 'glow-medium');
            
            if (coin.score >= 80) {
                card.classList.add('pulse', 'glow-strong');
            } else if (coin.score >= 65) {
                card.classList.add('glow-medium');
            }
        });
        
        // تحديث ألوان النقاط حسب القيمة
        document.querySelectorAll('.coin-score').forEach((scoreElement, index) => {
            const score = parseInt(scoreElement.textContent);
            
            if (score >= 80) {
                scoreElement.style.background = 'linear-gradient(135deg, #4CAF50, #45a049)';
                scoreElement.style.boxShadow = '0 0 15px rgba(76, 175, 80, 0.5)';
            } else if (score >= 65) {
                scoreElement.style.background = 'linear-gradient(135deg, #2196F3, #1976D2)';
                scoreElement.style.boxShadow = '0 0 10px rgba(33, 150, 243, 0.3)';
            } else if (score >= 50) {
                scoreElement.style.background = 'linear-gradient(135deg, #FF9800, #F57C00)';
                scoreElement.style.boxShadow = '0 0 8px rgba(255, 152, 0, 0.3)';
            } else {
                scoreElement.style.background = 'linear-gradient(135deg, #9E9E9E, #757575)';
                scoreElement.style.boxShadow = 'none';
            }
        });
    }

    formatNumber(num) {
        if (num >= 1) {
            return num.toFixed(4);
        } else if (num >= 0.01) {
            return num.toFixed(6);
        } else {
            return num.toFixed(8);
        }
    }

    formatVolume(volume) {
        if (volume >= 1e9) {
            return (volume / 1e9).toFixed(2) + 'B';
        } else if (volume >= 1e6) {
            return (volume / 1e6).toFixed(2) + 'M';
        } else if (volume >= 1e3) {
            return (volume / 1e3).toFixed(2) + 'K';
        } else {
            return volume.toFixed(2);
        }
    }

    // دالة للتنظيف عند إغلاق الصفحة
    cleanup() {
        if (this.updateTimer) {
            clearTimeout(this.updateTimer);
        }
        if (this.countdownTimer) {
            clearInterval(this.countdownTimer);
        }
        console.log('🧹 تم تنظيف الموارد');
    }

    // دالة لإعادة تشغيل التحليل يدوياً
    async forceRefresh() {
        console.log('🔄 إعادة تشغيل التحليل يدوياً...');
        this.showNotification('جاري إعادة تحليل العملات...', 'info');
        
        // إيقاف التحديث التلقائي مؤقتاً
        if (this.updateTimer) {
            clearTimeout(this.updateTimer);
        }
        
        await this.startAnalysis();
    }

    // دالة لحفظ البيانات في التخزين المحلي
    saveDataToLocalStorage() {
        try {
            const dataToSave = {
                coins: this.coins,
                timestamp: Date.now(),
                version: '2.0'
            };
            localStorage.setItem('cryptoAnalyzerData', JSON.stringify(dataToSave));
            console.log('💾 تم حفظ البيانات محلياً');
        } catch (error) {
            console.warn('خطأ في حفظ البيانات:', error);
        }
    }

    // دالة لتحميل البيانات من التخزين المحلي
    loadDataFromLocalStorage() {
        try {
            const savedData = localStorage.getItem('cryptoAnalyzerData');
            if (!savedData) return null;
            
            const parsed = JSON.parse(savedData);
            const age = Date.now() - parsed.timestamp;
            
            // البيانات صالحة لمدة 5 دقائق فقط
            if (age > 5 * 60 * 1000) {
                localStorage.removeItem('cryptoAnalyzerData');
                return null;
            }
            
            console.log('📂 تم تحميل البيانات المحفوظة');
            return parsed.coins;
        } catch (error) {
            console.warn('خطأ في تحميل البيانات:', error);
            return null;
        }
    }

    // دالة لإضافة معلومات الشبكة
    addNetworkInfo() {
        const networkInfo = document.createElement('div');
        networkInfo.className = 'network-info';
        networkInfo.innerHTML = `
            <div class="network-status">
                <span class="status-dot online"></span>
                <span>متصل بـ OKX API</span>
            </div>
            <div class="data-source">
                <span>📡 بيانات حقيقية ومباشرة</span>
            </div>
        `;
        
        const header = document.querySelector('.header');
        if (header) {
            header.appendChild(networkInfo);
        }
    }
}

// إضافة الأنماط المطلوبة
const additionalStyles = document.createElement('style');
additionalStyles.textContent = `
    @keyframes slideInRight {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes pulse {
        0% { transform: scale(1); }
        50% { transform: scale(1.02); }
        100% { transform: scale(1); }
    }
    
    .pulse {
        animation: pulse 2s infinite;
    }
    
    .glow-strong {
        box-shadow: 0 0 20px rgba(76, 175, 80, 0.4) !important;
        border: 2px solid rgba(76, 175, 80, 0.3) !important;
    }
    
    .glow-medium {
        box-shadow: 0 0 15px rgba(33, 150, 243, 0.3) !important;
        border: 2px solid rgba(33, 150, 243, 0.2) !important;
    }
    
    .notification button {
        background: none;
        border: none;
        color: white;
        font-size: 18px;
        cursor: pointer;
        padding: 0;
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        transition: background-color 0.2s;
    }
    
    .notification button:hover {
        background-color: rgba(255, 255, 255, 0.2);
    }
    
    .error-message {
        background: linear-gradient(135deg, #f44336, #d32f2f);
        color: white;
        padding: 15px 20px;
        border-radius: 10px;
        margin-bottom: 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        box-shadow: 0 4px 15px rgba(244, 67, 54, 0.3);
    }
    
    .error-message button {
        background: none;
        border: none;
        color: white;
        font-size: 18px;
        cursor: pointer;
        padding: 5px;
        border-radius: 50%;
        transition: background-color 0.2s;
    }
    
    .error-message button:hover {
        background-color: rgba(255, 255, 255, 0.2);
    }
    
    .status-bar {
        display: flex;
        gap: 20px;
        padding: 10px 0;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        margin-top: 10px;
    }
    
    .status-item {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 5px;
    }
    
    .status-label {
        font-size: 12px;
        color: #888;
    }
    
    .status-value {
        font-weight: bold;
        font-size: 14px;
    }
    
    .status-value.strong {
        color: #4CAF50;
    }
    
    .status-value.medium {
        color: #2196F3;
    }
    
    .real-data-badge {
        position: absolute;
        top: 10px;
        right: 10px;
        background: linear-gradient(135deg, #4CAF50, #45a049);
        color: white;
        padding: 4px 8px;
        border-radius: 12px;
        font-size: 10px;
        font-weight: bold;
        box-shadow: 0 2px 8px rgba(76, 175, 80, 0.3);
    }
    
    .coin-card {
        position: relative;
    }
    
    .network-info {
        display: flex;
        align-items: center;
        gap: 15px;
        font-size: 12px;
        color: #888;
    }
    
    .network-status {
        display: flex;
        align-items: center;
        gap: 5px;
    }
    
    .status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #4CAF50;
        animation: pulse 2s infinite;
    }
    
    .status-dot.online {
        background: #4CAF50;
        box-shadow: 0 0 8px rgba(76, 175, 80, 0.5);
    }
    
    .loading-content {
        text-align: center;
        padding: 40px;
    }
    
    .loading-content h3 {
        margin: 20px 0 10px 0;
        color: #333;
    }
    
    .loading-content p {
        margin: 5px 0;
        color: #666;
        font-size: 14px;
    }
    
    .spinner {
        width: 50px;
        height: 50px;
        border: 4px solid #f3f3f3;
        border-top: 4px solid #2196F3;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin: 0 auto;
    }
    
    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
    
    .indicator-value.bullish {
        color: #4CAF50;
        font-weight: bold;
    }
    
    .indicator-value.bearish {
        color: #f44336;
        font-weight: bold;
    }
    
    .indicator-value.neutral {
        color: #FF9800;
        font-weight: bold;
    }
    
    .analysis-details {
        margin-top: 15px;
        padding: 15px;
        background: rgba(0, 0, 0, 0.05);
        border-radius: 8px;
    }
    
    .analysis-details h4 {
        margin: 0 0 10px 0;
        color: #333;
    }
    
    .analysis-details ul {
        margin: 0;
        padding-right: 20px;
    }
    
    .analysis-details li {
        margin: 8px 0;
        line-height: 1.4;
    }
    
    .fade-in {
        animation: fadeIn 0.5s ease-in;
    }
    
    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
    }
`;

document.head.appendChild(additionalStyles);

// تشغيل التطبيق عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 بدء تشغيل مراقب العملات الرقمية...');
    
    const analyzer = new CryptoAnalyzer();
    
    // إضافة زر التحديث اليدوي
    const refreshButton = document.createElement('button');
    refreshButton.innerHTML = '🔄 تحديث الآن';
    refreshButton.className = 'refresh-button';
    refreshButton.onclick = () => analyzer.forceRefresh();
    
    refreshButton.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: linear-gradient(135deg, #2196F3, #1976D2);
        color: white;
        border: none;
        padding: 12px 20px;
        border-radius: 25px;
        cursor: pointer;
        font-weight: bold;
        box-shadow: 0 4px 15px rgba(33, 150, 243, 0.3);
        z-index: 1000;
        transition: all 0.3s ease;
    `;
    
    refreshButton.onmouseover = () => {
        refreshButton.style.transform = 'scale(1.05)';
            refreshButton.style.boxShadow = '0 6px 20px rgba(33, 150, 243, 0.4)';
    };
    
    refreshButton.onmouseout = () => {
        refreshButton.style.transform = 'scale(1)';
        refreshButton.style.boxShadow = '0 4px 15px rgba(33, 150, 243, 0.3)';
    };
    
    document.body.appendChild(refreshButton);
    
    // إضافة معلومات الشبكة
    analyzer.addNetworkInfo();
    
    // تنظيف الموارد عند إغلاق الصفحة
    window.addEventListener('beforeunload', () => {
        analyzer.cleanup();
    });
    
    // إضافة معالج للأخطاء العامة
    window.addEventListener('error', (event) => {
        console.error('خطأ في التطبيق:', event.error);
        analyzer.showNotification('حدث خطأ غير متوقع. سيتم المحاولة مرة أخرى.', 'error');
    });
    
    // إضافة معالج لأخطاء الشبكة
    window.addEventListener('online', () => {
        analyzer.showNotification('تم استعادة الاتصال بالإنترنت', 'success');
        analyzer.forceRefresh();
    });
    
    window.addEventListener('offline', () => {
        analyzer.showNotification('انقطع الاتصال بالإنترنت', 'error');
    });
    
    console.log('✅ تم تشغيل التطبيق بنجاح - البيانات حقيقية من OKX API');
});

// إضافة متغير عام للوصول للمحلل
window.cryptoAnalyzer = null;

// تحديث المتغير العام عند إنشاء المحلل
document.addEventListener('DOMContentLoaded', () => {
    if (!window.cryptoAnalyzer) {
        window.cryptoAnalyzer = new CryptoAnalyzer();
    }
});


