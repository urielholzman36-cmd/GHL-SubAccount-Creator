import { useState } from 'react';
import CollapsibleSection from './CollapsibleSection';

const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'America/Anchorage',
  'Pacific/Honolulu',
  'UTC',
];

const INITIAL_FORM = {
  businessName: '',
  businessPhone: '',
  businessEmail: '',
  address: '',
  city: '',
  state: '',
  zip: '',
  country: 'US',
  industry: 'general',
  timezone: '',
  areaCode: '',
  websiteUrl: '',
  firstName: '',
  lastName: '',
  industryText: '',
  businessDescription: '',
  targetAudience: '',
  brandColors: [],
};

function validate(fields) {
  const errors = {};

  if (!fields.businessName.trim()) errors.businessName = 'Business name is required.';
  if (!fields.firstName.trim()) errors.firstName = 'First name is required.';
  if (!fields.lastName.trim()) errors.lastName = 'Last name is required.';
  if (!fields.timezone) errors.timezone = 'Timezone is required.';

  if (!fields.businessEmail.trim()) {
    errors.businessEmail = 'Email is required.';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.businessEmail)) {
    errors.businessEmail = 'Enter a valid email address.';
  }

  const digits = fields.businessPhone.replace(/\D/g, '');
  if (!fields.businessPhone.trim()) {
    errors.businessPhone = 'Phone is required.';
  } else if (digits.length < 10) {
    errors.businessPhone = 'Phone must have at least 10 digits.';
  }

  if (!fields.areaCode.trim()) {
    errors.areaCode = 'Area code is required.';
  } else if (!/^\d{3}$/.test(fields.areaCode)) {
    errors.areaCode = 'Area code must be exactly 3 digits.';
  }

  if (fields.websiteUrl.trim()) {
    try {
      new URL(fields.websiteUrl);
    } catch {
      errors.websiteUrl = 'Enter a valid URL (e.g. https://example.com).';
    }
  }

  if (!fields.industryText || !fields.industryText.trim()) errors.industryText = 'Industry is required.';
  if (!fields.businessDescription || !fields.businessDescription.trim()) errors.businessDescription = 'Business description is required.';
  if (!fields.targetAudience || !fields.targetAudience.trim()) errors.targetAudience = 'Target audience is required.';

  return errors;
}

function validateField(name, value, allFields) {
  const result = validate({ ...allFields, [name]: value });
  return result[name] || '';
}

const inputClass =
  'w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white ' +
  'placeholder-white/20 focus:outline-none focus:border-magenta/50 focus:ring-1 focus:ring-magenta/30 transition';

const labelClass = 'block text-xs font-semibold text-white/40 uppercase tracking-wider mb-1.5';

function Field({ label, error, children }) {
  return (
    <div>
      {label && <label className={labelClass}>{label}</label>}
      {children}
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}

export default function BuildForm({ onBuildStarted }) {
  const [form, setForm] = useState(INITIAL_FORM);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [globalError, setGlobalError] = useState('');
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);

  async function handleLogoChange(e) {
    const file = e.target.files?.[0];
    if (!file) {
      setLogoFile(null);
      setLogoPreview(null);
      setForm((prev) => ({ ...prev, brandColors: [] }));
      return;
    }
    setLogoFile(file);

    const url = URL.createObjectURL(file);
    setLogoPreview(url);

    try {
      const ColorThief = (await import('colorthief')).default;
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.src = url;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });
      const thief = new ColorThief();
      const palette = thief.getPalette(img, 5) || [];
      const hexes = palette.map(([r, g, b]) => {
        const h = (n) => n.toString(16).padStart(2, '0');
        return `#${h(r)}${h(g)}${h(b)}`;
      });
      setForm((prev) => ({ ...prev, brandColors: hexes }));
    } catch (err) {
      console.error('Color extraction failed:', err);
      setForm((prev) => ({ ...prev, brandColors: [] }));
    }
  }

  function removeColor(idx) {
    setForm((prev) => ({
      ...prev,
      brandColors: prev.brandColors.filter((_, i) => i !== idx),
    }));
  }

  function addColor() {
    setForm((prev) => ({
      ...prev,
      brandColors: [...prev.brandColors, '#000000'],
    }));
  }

  function updateColor(idx, value) {
    setForm((prev) => ({
      ...prev,
      brandColors: prev.brandColors.map((c, i) => (i === idx ? value : c)),
    }));
  }

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name] !== undefined) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }
  }

  function handleBlur(e) {
    const { name, value } = e.target;
    const error = validateField(name, value, form);
    setErrors((prev) => ({ ...prev, [name]: error }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setGlobalError('');

    const allErrors = validate(form);
    if (!logoFile) {
      allErrors.logo = 'Logo is required.';
    }
    if (Object.keys(allErrors).length > 0) {
      setErrors(allErrors);
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('business_name', form.businessName);
      formData.append('business_phone', form.businessPhone);
      formData.append('business_email', form.businessEmail);
      formData.append('address', form.address);
      formData.append('city', form.city);
      formData.append('state', form.state);
      formData.append('zip', form.zip);
      formData.append('country', form.country);
      formData.append('industry', form.industry);
      formData.append('timezone', form.timezone);
      formData.append('area_code', form.areaCode);
      formData.append('website_url', form.websiteUrl || '');
      formData.append('owner_first_name', form.firstName);
      formData.append('owner_last_name', form.lastName);
      formData.append('industry_text', form.industryText);
      formData.append('business_description', form.businessDescription);
      formData.append('target_audience', form.targetAudience);
      formData.append('brand_colors', JSON.stringify(form.brandColors || []));
      formData.append('logo', logoFile);

      const res = await fetch('/api/builds', {
        method: 'POST',
        body: formData,
      });

      if (res.status === 201) {
        const data = await res.json();
        onBuildStarted(data.id, form.businessName);
      } else if (res.status === 400) {
        const data = await res.json();
        if (data.errors) {
          setErrors(data.errors);
        } else {
          setGlobalError(data.message || 'Validation error. Please check your inputs.');
        }
      } else {
        setGlobalError('An unexpected error occurred. Please try again.');
      }
    } catch {
      setGlobalError('Could not reach the server. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="glass rounded-xl p-6 space-y-8">

        {/* Section 1: Business Information */}
        <CollapsibleSection title="Business Information" defaultOpen={true}>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Field label="Business Name" error={errors.businessName}>
                <input
                  className={inputClass}
                  type="text"
                  name="businessName"
                  value={form.businessName}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  placeholder="Acme Corp"
                />
              </Field>
            </div>

            <Field label="Business Phone" error={errors.businessPhone}>
              <input
                className={inputClass}
                type="text"
                name="businessPhone"
                value={form.businessPhone}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder="(555) 000-0000"
              />
            </Field>

            <Field label="Business Email" error={errors.businessEmail}>
              <input
                className={inputClass}
                type="email"
                name="businessEmail"
                value={form.businessEmail}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder="hello@acme.com"
              />
            </Field>

            <div className="col-span-2">
              <Field label="Address" error={errors.address}>
                <input
                  className={inputClass}
                  type="text"
                  name="address"
                  value={form.address}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  placeholder="123 Main St"
                />
              </Field>
            </div>

            <Field label="City" error={errors.city}>
              <input
                className={inputClass}
                type="text"
                name="city"
                value={form.city}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder="Miami"
              />
            </Field>

            <Field label="State" error={errors.state}>
              <input
                className={inputClass}
                type="text"
                name="state"
                value={form.state}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder="FL"
              />
            </Field>

            <Field label="Zip" error={errors.zip}>
              <input
                className={inputClass}
                type="text"
                name="zip"
                value={form.zip}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder="33101"
              />
            </Field>

            <Field label="Country" error={errors.country}>
              <select
                className={inputClass}
                name="country"
                value={form.country}
                onChange={handleChange}
                onBlur={handleBlur}
              >
                <option value="US">United States</option>
                <option value="CA">Canada</option>
                <option value="GB">United Kingdom</option>
                <option value="AU">Australia</option>
                <option value="IL">Israel</option>
              </select>
            </Field>
          </div>
        </CollapsibleSection>

        {/* Section 2: Configuration */}
        <CollapsibleSection title="Configuration">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Timezone" error={errors.timezone}>
              <select
                className={inputClass}
                name="timezone"
                value={form.timezone}
                onChange={handleChange}
                onBlur={handleBlur}
              >
                <option value="">Select timezone…</option>
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </Field>

            <Field label="Phone Area Code" error={errors.areaCode}>
              <input
                className={inputClass}
                type="text"
                name="areaCode"
                value={form.areaCode}
                onChange={handleChange}
                onBlur={handleBlur}
                maxLength={3}
                placeholder="305"
              />
            </Field>

            <Field label="Website URL" error={errors.websiteUrl}>
              <input
                className={inputClass}
                type="text"
                name="websiteUrl"
                value={form.websiteUrl}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder="https://acme.com"
              />
            </Field>
          </div>
        </CollapsibleSection>

        {/* Section: Website & Branding */}
        <CollapsibleSection title="Website & Branding">
          <div className="grid grid-cols-1 gap-4">
            <Field label="Industry" error={errors.industryText}>
              <input
                type="text"
                className={inputClass}
                name="industryText"
                value={form.industryText}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder="e.g. Residential electrical contracting"
              />
            </Field>
            <Field label="Business Description" error={errors.businessDescription}>
              <textarea
                className={inputClass}
                name="businessDescription"
                rows={3}
                value={form.businessDescription}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder="e.g. We install and repair residential electrical systems including panel upgrades, EV charger installations, and smart home wiring..."
              />
            </Field>
            <Field label="Target Audience" error={errors.targetAudience}>
              <textarea
                className={inputClass}
                name="targetAudience"
                rows={3}
                value={form.targetAudience}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder="e.g. Homeowners aged 35-60 in San Diego County..."
              />
            </Field>
            <Field label="Logo" error={errors.logo}>
              <div className="flex items-center gap-4">
                <label className="cursor-pointer px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white/50 hover:bg-white/8 hover:border-white/20 transition">
                  Choose file
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml"
                    onChange={handleLogoChange}
                    className="hidden"
                  />
                </label>
                {logoFile && <span className="text-xs text-white/30">{logoFile.name}</span>}
              </div>
              {logoPreview && (
                <div className="mt-3">
                  <img src={logoPreview} alt="Logo preview" className="h-16 rounded-lg border border-white/10" />
                </div>
              )}
              {form.brandColors.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs text-white/30 mb-2">Brand colors (click to edit)</p>
                  <div className="flex gap-2 flex-wrap">
                    {form.brandColors.map((c, i) => (
                      <div key={i} className="relative group">
                        <input
                          type="color"
                          value={c}
                          onChange={(e) => updateColor(i, e.target.value)}
                          className="w-10 h-10 border border-white/10 rounded-lg cursor-pointer bg-transparent"
                        />
                        <button
                          type="button"
                          onClick={() => removeColor(i)}
                          className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={addColor}
                      className="w-10 h-10 border border-dashed border-white/15 rounded-lg text-white/20 hover:border-white/30 hover:text-white/40 transition"
                    >
                      +
                    </button>
                  </div>
                </div>
              )}
            </Field>
          </div>
        </CollapsibleSection>

        {/* Section 3: Account Owner */}
        <CollapsibleSection title="Account Owner">
          <div className="grid grid-cols-2 gap-4">
            <Field label="First Name" error={errors.firstName}>
              <input
                className={inputClass}
                type="text"
                name="firstName"
                value={form.firstName}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder="Jane"
              />
            </Field>

            <Field label="Last Name" error={errors.lastName}>
              <input
                className={inputClass}
                type="text"
                name="lastName"
                value={form.lastName}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder="Doe"
              />
            </Field>
          </div>
        </CollapsibleSection>

        {/* Global error */}
        {globalError && (
          <p className="text-sm text-red-400 text-center">{globalError}</p>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-brand-gradient text-white font-semibold
                     py-3 rounded-lg text-sm tracking-wide shadow-lg shadow-magenta/20 hover:opacity-90
                     transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {submitting ? 'Creating…' : 'Start Onboarding'}
        </button>

      </div>
    </form>
  );
}
