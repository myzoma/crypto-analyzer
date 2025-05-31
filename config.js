// إعدادات API و المنصة
const CONFIG = {
    // مفتاح API الخاص بمنصة OKX
    OKX_API: {
        BASE_URL: 'https://www.okx.com/api/v5',
        // يجب إضافة مفاتيح API الخاصة بك هنا
        API_KEY: 'b20c667d-ae40-48a6-93f4-a11a64185068',
        SECRET_KEY: 'BD7C76F71D1A4E01B4C7E1A23B620365',
        PASSPHRASE: '212160Nm$#'
    },
    
    // إعدادات التحديث
    UPDATE_INTERVAL: 15 * 60 * 1000, // 15 دقيقة بالميلي ثانية
    
    // إعدادات المؤشرات الفنية
    INDICATORS: {
        RSI: {
            PERIOD: 14,
            BREAKOUT_LEVEL: 50
        },
        MACD: {
            FAST_PERIOD: 12,
            SLOW_PERIOD: 26,
            SIGNAL_PERIOD: 9
        },
        SMA: {
            PERIOD: 20
        },
        VOLUME: {
            PERIOD: 4 // آخر 4 ساعات
        }
    },
    
    // إعدادات التصفية
    FILTERS: {
        MIN_VOLUME: 500000, // الحد الأدنى لحجم التداول
        MAX_RESULTS: 100, // أفضل 100 عملة
        EXCLUDED_SYMBOLS: [
            'USDT', 'USDC', 'BUSD', 'DAI', 'TUSD', 'USDP', 'USDD', 'FRAX'
        ], // العملات المستقرة المستبعدة
        QUOTE_CURRENCY: 'USDT' // العملة المرجعية
    },
    
    // نظام النقاط
    SCORING: {
        RSI_BREAKOUT: 20,
        MACD_SIGNAL: 20,
        SMA_BREAKOUT: 15,
        RESISTANCE_BREAK: 15,
        LIQUIDITY_CROSS: 10,
        VOLUME_INCREASE: 10,
        TREND_STRENGTH: 10
    },
    
    // إعدادات التحليل
    ANALYSIS: {
        SUPPORT_RESISTANCE_PERIODS: [20, 50, 100],
        FIBONACCI_LEVELS: [0.236, 0.382, 0.5, 0.618, 0.786],
        RISK_REWARD_RATIO: 2 // نسبة المخاطرة إلى العائد
    }
};

// دالة للتحقق من صحة الإعدادات
function validateConfig() {
    if (!CONFIG.OKX_API.API_KEY || CONFIG.OKX_API.API_KEY === 'YOUR_API_KEY_HERE') {
        console.warn('تحذير: لم يتم تعيين مفتاح API. سيتم استخدام بيانات تجريبية.');
        return false;
    }
    return true;
}

// تصدير الإعدادات
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}
