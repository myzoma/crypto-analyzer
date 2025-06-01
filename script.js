class CryptoAnalyzer {
    constructor() {
        this.coins = [];
        this.isLoading = false;
        this.updateTimer = null;
        this.countdownTimer = null;
        this.init();
    }


    
    init() {
        this.setupEventListeners();
        this.startAnalysis();
        this.startCountdown();
    }

    setupEventListeners() {
        // إغلاق النافذة المنبثقة
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
        // محاكاة جلب البيانات من OKX API
        const mockData = await this.getMockData();
        
        // تحليل كل عملة
        const analyzedCoins = [];
        for (const coinData of mockData) {
            const analysis = await this.analyzeCoin(coinData);
            if (analysis.score >= 10) { // فقط العملات التي تحقق الحد الأدنى
                analyzedCoins.push(analysis);
            }
        }
        
        // ترتيب حسب النقاط
        this.coins = analyzedCoins
            .sort((a, b) => b.score - a.score)
            .slice(0, CONFIG.FILTERS.MAX_RESULTS);
    }

async getMockData() {
    try {
        const response = await fetch('https://www.okx.com/api/v5/market/tickers?instType=SPOT');
        const data = await response.json();
        
        console.log('البيانات الخام:', data.data.slice(0, 3));
        
        const filteredData = data.data
            .filter(ticker => {
                return ticker.instId.endsWith('-USDT') && 
                       ticker.last && 
                       parseFloat(ticker.last) > 0;
            })
            .slice(0, 30)
            .map(ticker => ({
                symbol: ticker.instId.replace('-USDT', ''),
                name: ticker.instId.replace('-USDT', ''),
                price: parseFloat(ticker.last) || 0,
                change24h: ticker.chg24h ? (parseFloat(ticker.chg24h) * 100) : (Math.random() * 10 - 5), // قيمة عشوائية إذا لم تتوفر
                volume24h: parseFloat(ticker.volCcy24h) || 1000000,
                high24h: parseFloat(ticker.high24h) || parseFloat(ticker.last) * 1.05,
                low24h: parseFloat(ticker.low24h) || parseFloat(ticker.last) * 0.95,
                marketCap: (parseFloat(ticker.volCcy24h) || 1000000) * (parseFloat(ticker.last) || 1)
            }));
            
        console.log('العملات المفلترة:', filteredData.length);
        console.log('أول عملة:', filteredData[0]);
        return filteredData;
        
    } catch (error) {
        console.error('خطأ في جلب البيانات:', error);
        return [];
    }
}


  async analyzeCoin(coinData) {
    let score = 0;
    const indicators = {};

    // 1. تحليل التغيير اليومي (وزن أكبر)
    const change24h = isNaN(coinData.change24h) ? 0 : coinData.change24h;
    if (change24h > 5) {
        score += 30; // صعود قوي
        indicators.changeSignal = 'صعود قوي +5%';
    } else if (change24h > 2) {
        score += 20; // صعود متوسط
        indicators.changeSignal = 'صعود متوسط +2%';
    } else if (change24h > 0) {
        score += 10; // صعود خفيف
        indicators.changeSignal = 'صعود خفيف';
    } else if (change24h > -2) {
        score += 5; // استقرار
        indicators.changeSignal = 'مستقر';
    }

    // 2. تحليل الحجم (معيار مهم)
    const volume24h = isNaN(coinData.volume24h) ? 0 : coinData.volume24h;
    if (volume24h > 10000000) {
        score += 25; // حجم ممتاز
        indicators.volumeSignal = 'حجم تداول ممتاز';
    } else if (volume24h > 1000000) {
        score += 15; // حجم جيد
        indicators.volumeSignal = 'حجم تداول جيد';
    } else if (volume24h > 100000) {
        score += 8; // حجم متوسط
        indicators.volumeSignal = 'حجم تداول متوسط';
    }

    // 3. تحليل السعر والاستقرار
    const price = isNaN(coinData.price) ? 0 : coinData.price;
    const high24h = isNaN(coinData.high24h) ? price : coinData.high24h;
    const low24h = isNaN(coinData.low24h) ? price : coinData.low24h;
    
    const pricePosition = (price - low24h) / (high24h - low24h);
    if (pricePosition > 0.7) {
        score += 15; // قريب من القمة
        indicators.priceSignal = 'قريب من أعلى سعر';
    } else if (pricePosition > 0.3) {
        score += 20; // في المنتصف (مثالي)
        indicators.priceSignal = 'موقع سعري مثالي';
    } else {
        score += 10; // قريب من القاع
        indicators.priceSignal = 'قريب من أدنى سعر';
    }

    // 4. مؤشرات فنية محسنة
    const rsi = this.calculateRSI(coinData);
    if (rsi >= 40 && rsi <= 65) {
        score += 15; // RSI مثالي
        indicators.rsiSignal = 'RSI في المنطقة المثالية';
    } else if (rsi >= 30 && rsi <= 70) {
        score += 8; // RSI جيد
        indicators.rsiSignal = 'RSI في منطقة جيدة';
    }

    // 5. تحليل الزخم
    const momentum = change24h * (volume24h / 1000000);
    if (momentum > 50) {
        score += 15;
        indicators.momentumSignal = 'زخم قوي جداً';
    } else if (momentum > 10) {
        score += 10;
        indicators.momentumSignal = 'زخم جيد';
    }

    // باقي الحسابات...
    const levels = this.calculateAdvancedLevels(coinData);
    const targets = this.calculateSmartTargets(coinData, levels);
    const entryExit = this.calculateAdvancedEntry(coinData, levels);

    return {
        ...coinData,
        score: Math.min(score, 100),
        indicators,
        levels,
        targets,
        entryExit,
        strategy: 'Enhanced Multi-Factor Analysis',
        analysis: this.generateAdvancedAnalysis(coinData, indicators, score)
    };
}



 calculateRSI(coinData) {
    const change24h = isNaN(coinData.change24h) ? 0 : coinData.change24h;
    const baseRSI = 45 + (change24h * 2);
    return Math.max(20, Math.min(80, baseRSI + Math.random() * 10));
}

calculateMACD(coinData) {
    const change24h = isNaN(coinData.change24h) ? 0 : coinData.change24h;
    const macdValue = change24h > 2 ? 'bullish' : 'bearish';
    return {
        value: change24h * 0.1,
        signal: macdValue,
        histogram: Math.random() * 2 - 1
    };
}

calculateSMA(coinData) {
    const price = isNaN(coinData.price) ? 0 : coinData.price;
    return price * (0.95 + Math.random() * 0.1);
}

calculateResistance(coinData) {
    const high24h = isNaN(coinData.high24h) ? coinData.price : coinData.high24h;
    return high24h * (1 + Math.random() * 0.05);
}

calculateLiquidity(coinData) {
    const volume24h = isNaN(coinData.volume24h) ? 0 : coinData.volume24h;
    return volume24h > 100000 ? Math.random() * 2 - 1 : -1;
}

calculateVolumeIncrease(coinData) {
    return Math.random() * 50;
}

calculateTrendStrength(coinData) {
    const change24h = isNaN(coinData.change24h) ? 0 : coinData.change24h;
    return Math.abs(change24h) * 10 + Math.random() * 20;
}

calculateSupportResistanceLevels(coinData) {
    const currentPrice = isNaN(coinData.price) ? 0 : coinData.price;
    const high24h = isNaN(coinData.high24h) ? currentPrice : coinData.high24h;
    const low24h = isNaN(coinData.low24h) ? currentPrice : coinData.low24h;
    
    return {
        support1: low24h * 0.98,
        support2: low24h * 0.95,
        resistance1: high24h * 1.02,
        resistance2: high24h * 1.05,
        pivot: (high24h + low24h + currentPrice) / 3
    };
}
// تحليل الاتجاه اليومي
analyzeDailyTrend(coinData) {
    const change24h = isNaN(coinData.change24h) ? 0 : coinData.change24h;
    const volume24h = isNaN(coinData.volume24h) ? 0 : coinData.volume24h;
    
    // محاكاة EMA 20 و EMA 50
    const ema20 = coinData.price * (0.98 + Math.random() * 0.04);
    const ema50 = coinData.price * (0.95 + Math.random() * 0.06);
    
    const signal = ema20 > ema50 && change24h > 0 ? 'bullish' : 'bearish';
    
    return {
        ema20,
        ema50,
        signal,
        strength: Math.abs(change24h) * 10,
        volume: volume24h
    };
}

// تحليل 4 ساعات
analyze4H(coinData) {
    const change24h = isNaN(coinData.change24h) ? 0 : coinData.change24h;
    
    // محاكاة MACD
    const macd = change24h > 1 ? 'bullish' : 'bearish';
    
    // محاكاة Bollinger Bands
    const bb = {
        upper: coinData.price * 1.05,
        middle: coinData.price,
        lower: coinData.price * 0.95,
        position: Math.random() > 0.5 ? 'middle' : 'lower'
    };
    
    // قوة الحجم
    const volumeStrength = Math.random();
    
    return {
        macd,
        bollingerBands: bb,
        volume: volumeStrength,
        momentum: change24h * 5
    };
}

// تحليل الساعة
analyze1H(coinData) {
    const change24h = isNaN(coinData.change24h) ? 0 : coinData.change24h;
    
    // RSI للساعة
    const rsi = Math.max(30, Math.min(70, 50 + change24h * 3));
    
    // Stochastic
    const stoch = Math.random() * 100;
    
    // كسر المقاومة
    const breakout = change24h > 2 && Math.random() > 0.3;
    
    return {
        rsi,
        stochastic: stoch,
        breakout,
        momentum: change24h * 8,
        signal: rsi >= 40 && rsi <= 60 ? 'buy' : 'wait'
    };
}

// حساب نسبة المخاطرة للربح
calculateRiskReward(coinData) {
    const currentPrice = coinData.price;
    
    // وقف الخسارة 3%
    const stopLoss = currentPrice * 0.97;
    
    // هدف أول 6%
    const target1 = currentPrice * 1.06;
    
    // هدف ثاني 9%
    const target2 = currentPrice * 1.09;
    
    const risk = currentPrice - stopLoss;
    const reward = target1 - currentPrice;
    const ratio = reward / risk;
    
    return {
        stopLoss,
        target1,
        target2,
        risk: risk,
        reward: reward,
        ratio: ratio
    };
}

// تحليل الحجم
analyzeVolume(coinData) {
    const volume24h = isNaN(coinData.volume24h) ? 0 : coinData.volume24h;
    
    // قوة الحجم
    let strength = 0;
    if (volume24h > 100000000) strength = 90;
    else if (volume24h > 10000000) strength = 75;
    else if (volume24h > 1000000) strength = 60;
    else if (volume24h > 100000) strength = 40;
    else strength = 20;
    
    return {
        strength,
        volume24h,
        trend: volume24h > 1000000 ? 'increasing' : 'low',
        quality: strength > 60 ? 'high' : 'medium'
    };
}

// المؤشرات الفنية الإضافية
calculateTechnicals(coinData) {
    const change24h = isNaN(coinData.change24h) ? 0 : coinData.change24h;
    let bullishSignals = 0;
    
    // إشارات صعودية
    if (change24h > 0) bullishSignals++;
    if (change24h > 2) bullishSignals++;
    if (coinData.volume24h > 1000000) bullishSignals++;
    if (coinData.price > coinData.low24h * 1.02) bullishSignals++;
    if (Math.random() > 0.4) bullishSignals++; // إشارة عشوائية
    
    return {
        bullishSignals,
        bearishSignals: 5 - bullishSignals,
        overall: bullishSignals >= 3 ? 'bullish' : 'bearish'
    };
}

// مستويات متقدمة
calculateAdvancedLevels(coinData) {
    const price = coinData.price;
    const high24h = isNaN(coinData.high24h) ? price : coinData.high24h;
    const low24h = isNaN(coinData.low24h) ? price : coinData.low24h;
    
    return {
        // مستويات فيبوناتشي
        fib236: low24h + (high24h - low24h) * 0.236,
        fib382: low24h + (high24h - low24h) * 0.382,
        fib618: low24h + (high24h - low24h) * 0.618,
        
        // مستويات الدعم والمقاومة
        support1: low24h * 0.99,
        support2: low24h * 0.97,
        resistance1: high24h * 1.01,
        resistance2: high24h * 1.03,
        
        // نقطة المحورية
        pivot: (high24h + low24h + price) / 3
    };
}

// أهداف ذكية
calculateSmartTargets(coinData, levels) {
    const price = coinData.price;
    
    return {
        quickProfit: price * 1.05,    // ربح سريع 5%
        target1: price * 1.08,        // هدف أول 8%
        target2: levels.resistance1,   // مقاومة أولى
        target3: levels.fib618,       // فيبوناتشي 61.8%
        longTerm: price * 1.15        // هدف بعيد 15%
    };
}

// نقطة دخول متقدمة
calculateAdvancedEntry(coinData, levels) {
    const price = coinData.price;
    
    return {
        entryPrice: price * 1.002,     // دخول فوق السعر الحالي
        stopLoss: price * 0.97,        // وقف خسارة 3%
        trailingStop: price * 0.98,    // وقف متحرك
        positionSize: '3-5%',          // حجم المركز
        timeframe: '1-3 أيام',         // الإطار الزمني
        riskLevel: 'متوسط'
    };
}

// تحليل متقدم
generateAdvancedAnalysis(coinData, indicators, score) {
    let analysis = `تحليل متعدد الإطارات الزمنية لعملة ${coinData.symbol}:\n\n`;
    
    if (indicators.dailySignal) {
        analysis += `📈 ${indicators.dailySignal}\n`;
    }
    
    if (indicators.h4Signal) {
        analysis += `⏰ ${indicators.h4Signal}\n`;
    }
    
    if (indicators.h1Signal) {
        analysis += `🎯 ${indicators.h1Signal}\n`;
    }
    
    if (indicators.rrSignal) {
        analysis += `💰 ${indicators.rrSignal}\n`;
    }
    
    analysis += `\n📊 النقاط الإجمالية: ${score}/100`;
    
    if (score >= 70) {
        analysis += `\n✅ توصية: شراء قوي`;
    } else if (score >= 50) {
        analysis += `\n⚠️ توصية: شراء بحذر`;
    } else {
        analysis += `\n❌ توصية: انتظار`;
    }
    
    return analysis;
}


calculateLiquidity(coinData) {
    const volume24h = isNaN(coinData.volume24h) ? 0 : coinData.volume24h;
    return volume24h > 100000 ? Math.random() * 2 - 1 : -1; // خففت من مليار إلى 100 ألف
}


    calculatePriceTargets(coinData, levels) {
        const currentPrice = coinData.price;
        const resistance = levels.resistance1;
        
        return {
            target1: currentPrice * 1.05,
            target2: currentPrice * 1.10,
            target3: currentPrice * 1.15,
            longTerm: resistance * 1.08
        };
    }

    calculateEntryExit(coinData, levels) {
        const currentPrice = coinData.price;
        
        return {
            entryPoint: currentPrice * 0.995,
            stopLoss: levels.support1,
            takeProfit: currentPrice * 1.08
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
        if (indicators.rsiSignal) analysis += ` مؤشر RSI يظهر ${indicators.rsiSignal}.`;
        if (indicators.macdSignal) analysis += ` MACD يعطي ${indicators.macdSignal}.`;
        if (indicators.volumeSignal) analysis += ` حجم التداول يظهر ${indicators.volumeSignal}.`;
        
        return analysis;
    }

    renderCoins() {
        const grid = document.getElementById('coinsGrid');
        grid.innerHTML = '';
        
        this.coins.forEach((coin, index) => {
            const card = this.createCoinCard(coin, index + 1);
            grid.appendChild(card);
        });
        
        grid.classList.add('fade-in');
    }

    createCoinCard(coin, rank) {
        const card = document.createElement('div');
        card.className = 'coin-card';
        card.onclick = () => this.showCoinDetails(coin);
        
        const changeClass = coin.change24h >= 0 ? 'positive' : 'negative';
        const changeSymbol = coin.change24h >= 0 ? '+' : '';
        
        card.innerHTML = `
            <div class="coin-header">
                <div class="coin-logo">
                    <span>${coin.symbol.charAt(0)}</span>
                </div>
                <div class="coin-name">
                    <h3>${coin.symbol}</h3>
                    <span class="rank">المركز ${rank}</span>
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
                       ${changeSymbol}${(coin.change24h || 0).toFixed(2)}%
                    </div>
                </div>
                <div class="detail-item">
                    <div class="label">حجم التداول</div>
                    <div class="value volume">$${this.formatVolume(coin.volume24h)}</div>
                </div>
                <div class="detail-item">
                    <div class="label">القيمة السوقية</div>
                    <div class="value">$${this.formatVolume(coin.marketCap)}</div>
                </div>
            </div>
            
            <div class="indicators">
                ${this.renderIndicators(coin.indicators)}
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
        
        return html;
    }

  showCoinDetails(coin) {
    try {
        const modal = document.getElementById('coinModal');
        if (!modal) {
            console.error('النافذة المنبثقة غير موجودة في HTML');
            return;
        }

        // التحقق من وجود البيانات
        if (!coin || !coin.symbol) {
            console.error('بيانات العملة غير صحيحة:', coin);
            return;
        }

        // تحديث معلومات الرأس بأمان
        const modalCoinSymbol = document.getElementById('modalCoinSymbol');
        const modalCoinName = document.getElementById('modalCoinName');
        const modalCoinPrice = document.getElementById('modalCoinPrice');
        const modalCoinScore = document.getElementById('modalCoinScore');

        if (modalCoinSymbol) modalCoinSymbol.textContent = coin.symbol.charAt(0);
        if (modalCoinName) modalCoinName.textContent = coin.symbol;
        if (modalCoinPrice) modalCoinPrice.textContent = `$${this.formatNumber(coin.price || 0)}`;
        if (modalCoinScore) modalCoinScore.textContent = (coin.score || 0).toFixed(0);

        // التحليل الفني
        const technicalAnalysis = document.getElementById('technicalAnalysis');
        if (technicalAnalysis) {
            technicalAnalysis.innerHTML = `<p>${coin.analysis || 'تحليل غير متوفر'}</p>`;
        }

        // المستويات الحرجة مع قيم افتراضية آمنة
        const price = coin.price || 0;
        const supportLevel = document.getElementById('supportLevel');
        const resistanceLevel = document.getElementById('resistanceLevel');
        const entryPoint = document.getElementById('entryPoint');
        const stopLoss = document.getElementById('stopLoss');

        if (supportLevel) supportLevel.textContent = `$${this.formatNumber((coin.levels?.support1) || (price * 0.95))}`;
        if (resistanceLevel) resistanceLevel.textContent = `$${this.formatNumber((coin.levels?.resistance1) || (price * 1.05))}`;
        if (entryPoint) entryPoint.textContent = `$${this.formatNumber((coin.entryExit?.entryPoint) || (price * 1.002))}`;
        if (stopLoss) stopLoss.textContent = `$${this.formatNumber((coin.entryExit?.stopLoss) || (price * 0.97))}`;

        // الأهداف السعرية
        const priceTargets = document.getElementById('priceTargets');
        if (priceTargets) {
            priceTargets.innerHTML = `
                <div class="target">الهدف الأول: $${this.formatNumber((coin.targets?.target1) || (price * 1.05))}</div>
                <div class="target">الهدف الثاني: $${this.formatNumber((coin.targets?.target2) || (price * 1.10))}</div>
                <div class="target">الهدف الثالث: $${this.formatNumber((coin.targets?.target3) || (price * 1.15))}</div>
                <div class="target">الهدف طويل المدى: $${this.formatNumber((coin.targets?.longTerm) || (price * 1.20))}</div>
            `;
        }

        // المؤشرات التفصيلية
        const indicatorsDetail = document.getElementById('indicatorsDetail');
        if (indicatorsDetail) {
            indicatorsDetail.innerHTML = this.renderDetailedIndicators(coin.indicators || {});
        }

        modal.style.display = 'block';
        
    } catch (error) {
        console.error('خطأ في فتح النافذة:', error);
        const price = coin?.price || 0;
        const score = coin?.score || 0;
        alert(`تفاصيل ${coin?.symbol || 'غير معروف'}:\nالسعر: $${this.formatNumber(price)}\nالنقاط: ${score.toFixed(0)}\nالتحليل: ${coin?.analysis || 'غير متوفر'}`);
    }
}



    getIndicatorClass(value, lowThreshold, highThreshold) {
        if (value >= highThreshold) return 'bullish';
        if (value <= lowThreshold) return 'bearish';
        return 'neutral';
    }

    updateStats() {
        const totalCoins = this.coins.length;
        const avgScore = totalCoins > 0 ? 
            this.coins.reduce((sum, coin) => sum + coin.score, 0) / totalCoins : 0;
        const topCoin = totalCoins > 0 ? this.coins[0].symbol : '--';
        
        document.getElementById('totalCoins').textContent = totalCoins;
        document.getElementById('avgScore').textContent = avgScore.toFixed(1);
        document.getElementById('topCoin').textContent = topCoin;
    }

    updateLastUpdateTime() {
        const now = new Date();
        const timeString = now.toLocaleTimeString('ar-SA', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        document.getElementById('lastUpdate').textContent = `آخر تحديث: ${timeString}`;
    }

    startCountdown() {
        let timeLeft = CONFIG.UPDATE_INTERVAL / 1000; // تحويل إلى ثواني
        
        this.countdownTimer = setInterval(() => {
            const minutes = Math.floor(timeLeft / 60);
            const seconds = timeLeft % 60;
            
            document.getElementById('countdown').textContent = 
                `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            
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
            this.startAnalysis();
        }, CONFIG.UPDATE_INTERVAL);
    }

    showLoading(show) {
        const loading = document.getElementById('loading');
        const grid = document.getElementById('coinsGrid');
        
        if (show) {
            loading.classList.remove('hidden');
            grid.classList.add('hidden');
        } else {
            loading.classList.add('hidden');
            grid.classList.remove('hidden');
        }
    }

    showError(message) {
        const container = document.querySelector('.container');
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = message;
        
        container.insertBefore(errorDiv, container.firstChild);
        
        setTimeout(() => {
            errorDiv.remove();
        }, 5000);
    }

    formatNumber(num) {
    // التحقق من صحة القيمة
    if (num === null || num === undefined || isNaN(num)) {
        return '0.00';
    }
    
    const number = parseFloat(num);
    if (isNaN(number)) {
        return '0.00';
    }
    
    if (number >= 1000000000) {
        return (number / 1000000000).toFixed(2) + 'B';
    } else if (number >= 1000000) {
        return (number / 1000000).toFixed(2) + 'M';
    } else if (number >= 1000) {
        return (number / 1000).toFixed(2) + 'K';
    } else if (number >= 1) {
        return number.toFixed(2);
    } else if (number >= 0.01) {
        return number.toFixed(4);
    } else {
        return number.toFixed(8);
    }
}


    // دالة لجلب البيانات الحقيقية من OKX API
    async fetchRealData() {
        if (!validateConfig()) {
            console.log('استخدام البيانات التجريبية...');
            return this.getMockData();
        }

        try {
            // جلب قائمة العملات
            const instrumentsResponse = await fetch(`${CONFIG.OKX_API.BASE_URL}/public/instruments?instType=SPOT`);
            const instrumentsData = await instrumentsResponse.json();
            
            // تصفية العملات المطلوبة
            const validInstruments = instrumentsData.data.filter(inst => 
                inst.quoteCcy === CONFIG.FILTERS.QUOTE_CURRENCY &&
                !CONFIG.FILTERS.EXCLUDED_SYMBOLS.includes(inst.baseCcy) &&
                inst.state === 'live'
            );

            // جلب بيانات السوق
            const marketData = [];
            for (const inst of validInstruments.slice(0, 200)) { // أول 200 عملة
                                try {
                    const tickerResponse = await fetch(`${CONFIG.OKX_API.BASE_URL}/market/ticker?instId=${inst.instId}`);
                    const tickerData = await tickerResponse.json();
                    
                    if (tickerData.code === '0' && tickerData.data.length > 0) {
                        const ticker = tickerData.data[0];
                        
                        marketData.push({
                            symbol: inst.baseCcy,
                            name: inst.baseCcy,
                            price: parseFloat(ticker.last),
                            change24h: parseFloat(ticker.chgUtc0),
                            volume24h: parseFloat(ticker.vol24h) * parseFloat(ticker.last),
                            high24h: parseFloat(ticker.high24h),
                            low24h: parseFloat(ticker.low24h),
                            marketCap: parseFloat(ticker.vol24h) * parseFloat(ticker.last) * 100 // تقدير تقريبي
                        });
                    }
                    
                    // تأخير بسيط لتجنب تجاوز حدود API
                    await new Promise(resolve => setTimeout(resolve, 100));
                } catch (error) {
                    console.warn(`خطأ في جلب بيانات ${inst.baseCcy}:`, error);
                }
            }
            
            return marketData.filter(coin => 
                coin.volume24h >= CONFIG.FILTERS.MIN_VOLUME &&
                coin.price > 0
            );
            
        } catch (error) {
            console.error('خطأ في جلب البيانات من OKX:', error);
            return this.getMockData();
        }
    }

    // دالة لحساب المؤشرات الفنية الحقيقية
    async calculateRealIndicators(symbol) {
        try {
            // جلب بيانات الشموع للحسابات الفنية
            const candlesResponse = await fetch(
                `${CONFIG.OKX_API.BASE_URL}/market/candles?instId=${symbol}-USDT&bar=1H&limit=100`
            );
            const candlesData = await candlesResponse.json();
            
            if (candlesData.code !== '0' || !candlesData.data.length) {
                throw new Error('لا توجد بيانات شموع');
            }
            
            const candles = candlesData.data.map(candle => ({
                timestamp: parseInt(candle[0]),
                open: parseFloat(candle[1]),
                high: parseFloat(candle[2]),
                low: parseFloat(candle[3]),
                close: parseFloat(candle[4]),
                volume: parseFloat(candle[5])
            })).reverse(); // ترتيب من الأقدم للأحدث
            
            return {
                rsi: this.calculateRealRSI(candles),
                macd: this.calculateRealMACD(candles),
                sma: this.calculateRealSMA(candles),
                volumeProfile: this.calculateVolumeProfile(candles)
            };
            
        } catch (error) {
            console.warn(`خطأ في حساب المؤشرات لـ ${symbol}:`, error);
            return null;
        }
    }

    calculateRealRSI(candles, period = 14) {
        if (candles.length < period + 1) return 50;
        
        let gains = 0;
        let losses = 0;
        
        // حساب المتوسط الأولي
        for (let i = 1; i <= period; i++) {
            const change = candles[i].close - candles[i - 1].close;
            if (change > 0) {
                gains += change;
            } else {
                losses += Math.abs(change);
            }
        }
        
        let avgGain = gains / period;
        let avgLoss = losses / period;
        
        // حساب RSI للشمعة الأخيرة
        for (let i = period + 1; i < candles.length; i++) {
            const change = candles[i].close - candles[i - 1].close;
            const gain = change > 0 ? change : 0;
            const loss = change < 0 ? Math.abs(change) : 0;
            
            avgGain = (avgGain * (period - 1) + gain) / period;
            avgLoss = (avgLoss * (period - 1) + loss) / period;
        }
        
        if (avgLoss === 0) return 100;
        
        const rs = avgGain / avgLoss;
        return 100 - (100 / (1 + rs));
    }

    calculateRealMACD(candles, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
        if (candles.length < slowPeriod) return { value: 0, signal: 'neutral', histogram: 0 };
        
        const ema12 = this.calculateEMA(candles.map(c => c.close), fastPeriod);
        const ema26 = this.calculateEMA(candles.map(c => c.close), slowPeriod);
        
        const macdLine = ema12[ema12.length - 1] - ema26[ema26.length - 1];
        const macdHistory = [];
        
        for (let i = slowPeriod - 1; i < candles.length; i++) {
            macdHistory.push(ema12[i] - ema26[i]);
        }
        
        const signalLine = this.calculateEMA(macdHistory, signalPeriod);
        const histogram = macdLine - signalLine[signalLine.length - 1];
        
        return {
            value: macdLine,
            signal: histogram > 0 ? 'bullish' : 'bearish',
            histogram: histogram
        };
    }

    calculateEMA(prices, period) {
        const ema = [];
        const multiplier = 2 / (period + 1);
        
        // أول قيمة هي SMA
        let sum = 0;
        for (let i = 0; i < period; i++) {
            sum += prices[i];
        }
        ema[period - 1] = sum / period;
        
        // باقي القيم
        for (let i = period; i < prices.length; i++) {
            ema[i] = (prices[i] * multiplier) + (ema[i - 1] * (1 - multiplier));
        }
        
        return ema;
    }

    calculateRealSMA(candles, period = 20) {
        if (candles.length < period) return candles[candles.length - 1].close;
        
        const prices = candles.slice(-period).map(c => c.close);
        return prices.reduce((sum, price) => sum + price, 0) / period;
    }

    calculateVolumeProfile(candles) {
        const recentCandles = candles.slice(-CONFIG.INDICATORS.VOLUME.PERIOD);
        const avgVolume = recentCandles.reduce((sum, c) => sum + c.volume, 0) / recentCandles.length;
        const currentVolume = candles[candles.length - 1].volume;
        
        return {
            current: currentVolume,
            average: avgVolume,
            increase: ((currentVolume - avgVolume) / avgVolume) * 100
        };
    }

    // دالة لحفظ البيانات محلياً لتحسين الأداء
    saveToLocalStorage(key, data) {
        try {
            const dataWithTimestamp = {
                data: data,
                timestamp: Date.now()
            };
            localStorage.setItem(key, JSON.stringify(dataWithTimestamp));
        } catch (error) {
            console.warn('خطأ في حفظ البيانات محلياً:', error);
        }
    }

    loadFromLocalStorage(key, maxAge = 5 * 60 * 1000) { // 5 دقائق افتراضياً
        try {
            const stored = localStorage.getItem(key);
            if (!stored) return null;
            
            const parsed = JSON.parse(stored);
            const age = Date.now() - parsed.timestamp;
            
            if (age > maxAge) {
                localStorage.removeItem(key);
                return null;
            }
            
            return parsed.data;
        } catch (error) {
            console.warn('خطأ في تحميل البيانات المحلية:', error);
            return null;
        }
    }

    // دالة لإضافة تأثيرات بصرية
    addVisualEffects() {
        // تأثير النبض للعملات عالية النقاط
        this.coins.forEach((coin, index) => {
            if (coin.score >= 80) {
                const card = document.querySelectorAll('.coin-card')[index];
                if (card) {
                    card.classList.add('pulse');
                }
            }
        });
        
        // تحديث ألوان النقاط حسب القيمة
        document.querySelectorAll('.coin-score').forEach(scoreElement => {
            const score = parseInt(scoreElement.textContent);
            
            if (score >= 80) {
                scoreElement.style.background = 'linear-gradient(135deg, #4CAF50, #45a049)';
            } else if (score >= 65) {
                scoreElement.style.background = 'linear-gradient(135deg, #2196F3, #1976D2)';
            } else if (score >= 50) {
                scoreElement.style.background = 'linear-gradient(135deg, #FF9800, #F57C00)';
            } else {
                scoreElement.style.background = 'linear-gradient(135deg, #9E9E9E, #757575)';
            }
        });
    }

    // دالة لإضافة إشعارات للمستخدم
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <span>${message}</span>
            <button onclick="this.parentElement.remove()">×</button>
        `;
        
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3'};
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
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 5000);
    }

    // دالة للتنظيف عند إغلاق الصفحة
    cleanup() {
        if (this.updateTimer) {
            clearTimeout(this.updateTimer);
        }
        if (this.countdownTimer) {
            clearInterval(this.countdownTimer);
        }
    }
}

// إضافة أنماط CSS للإشعارات
const notificationStyles = document.createElement('style');
notificationStyles.textContent = `
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
    }
`;
document.head.appendChild(notificationStyles);

// تشغيل التطبيق عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
    const analyzer = new CryptoAnalyzer();
    
    // تنظيف الموارد عند إغلاق الصفحة
    window.addEventListener('beforeunload', () => {
        analyzer.cleanup();
    });
    
    // إضافة معالج للأخطاء العامة
    window.addEventListener('error', (event) => {
        console.error('خطأ في التطبيق:', event.error);
        analyzer.showNotification('حدث خطأ غير متوقع. سيتم إعادة المحاولة.', 'error');
    });
    
    console.log('🚀 تم تشغيل مراقب العملات الرقمية بنجاح!');
});

