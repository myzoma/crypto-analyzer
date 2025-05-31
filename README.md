# محلل العملات المشفرة

تطبيق ويب لتحليل العملات المشفرة باستخدام المؤشرات الفنية المتقدمة.

## المميزات

- تحليل فني شامل للعملات المشفرة
- نظام تقييم بالنقاط من 100
- واجهة مستخدم عربية احترافية
- تحديث تلقائي كل 15 دقيقة
- تحليل مفصل لكل عملة
- توصيات تداول احترافية

## التثبيت

1. استنساخ المشروع:
```bash
git clone <repository-url>
cd crypto-analyzer
```

2. تثبيت المتطلبات:
```bash
pip install -r requirements.txt
```

3. إعداد ملف التكوين:
```bash
cp config.json.example config.json
# قم بتعديل ملف config.json وإضافة مفاتيح API الخاصة بك
```

4. تشغيل التطبيق:
```bash
python app.py
```

## الإعداد

قم بتعديل ملف `config.json` وإضافة:
- مفاتيح API الخاصة بمنصة OKX
- إعدادات التحديث والفلترة

## الاستخدام

1. افتح المتصفح على `http://localhost:5000`
2. ستظهر العملات مرتبة حسب النقاط
3. اضغط على أي عملة لعرض التحليل المفصل

## المؤشرات المستخدمة

- RSI (Relative Strength Index)
- MACD (Moving Average Convergence Divergence)
- SMA (Simple Moving Average)
- OBV (On-Balance Volume)
- تحليل الدعم والمقاومة
- تحليل حجم التداول

## التحذيرات

- هذا التطبيق للأغراض التعليمية فقط
- لا يعتبر نصيحة استثمارية
- تداول العملات المشفرة ينطوي على مخاطر عالية
```

## تعليمات التشغيل:

1. **إعداد البيئة:**
```bash
python -m venv crypto_analyzer
source crypto_analyzer/bin/activate  # Linux/Mac
# أو
crypto_analyzer\Scripts\activate  # Windows
```

2. **تثبيت المتطلبات:**
```bash
pip install -r requirements.txt
```

3. **إعداد ملف التكوين:**
- قم بتعديل `config.json` وإضافة مفاتيح API الخاصة بك من منصة OKX

4. **تشغيل التطبيق:**
```bash
python app.py
