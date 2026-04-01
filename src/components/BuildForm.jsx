import { useState } from 'react';

const INDUSTRIES = ['Construction', 'Plumbing', 'Electrical', 'Cleaning', 'General'];

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
  industry: '',
  timezone: '',
  areaCode: '',
  websiteUrl: '',
  firstName: '',
  lastName: '',
};

function validate(fields) {
  const errors = {};

  // Required text fields
  if (!fields.businessName.trim()) errors.businessName = 'Business name is required.';
  if (!fields.firstName.trim()) errors.firstName = 'First name is required.';
  if (!fields.lastName.trim()) errors.lastName = 'Last name is required.';
  if (!fields.industry) errors.industry = 'Industry is required.';
  if (!fields.timezone) errors.timezone = 'Timezone is required.';

  // Email
  if (!fields.businessEmail.trim()) {
    errors.businessEmail = 'Email is required.';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.businessEmail)) {
    errors.businessEmail = 'Enter a valid email address.';
  }

  // Phone: 10+ digits after stripping non-digits
  const digits = fields.businessPhone.replace(/\D/g, '');
  if (!fields.businessPhone.trim()) {
    errors.businessPhone = 'Phone is required.';
  } else if (digits.length < 10) {
    errors.businessPhone = 'Phone must have at least 10 digits.';
  }

  // Area code: exactly 3 digits
  if (!fields.areaCode.trim()) {
    errors.areaCode = 'Area code is required.';
  } else if (!/^\d{3}$/.test(fields.areaCode)) {
    errors.areaCode = 'Area code must be exactly 3 digits.';
  }

  // Website URL (optional)
  if (fields.websiteUrl.trim()) {
    try {
      new URL(fields.websiteUrl);
    } catch {
      errors.websiteUrl = 'Enter a valid URL (e.g. https://example.com).';
    }
  }

  return errors;
}

function validateField(name, value, allFields) {
  const result = validate({ ...allFields, [name]: value });
  return result[name] || '';
}

const inputClass =
  'w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 ' +
  'focus:outline-none focus:border-magenta focus:ring-1 focus:ring-magenta transition';

const labelClass = 'block text-xs font-semibold text-gray-500 uppercase mb-1';

function Field({ label, error, children }) {
  return (
    <div>
      {label && <label className={labelClass}>{label}</label>}
      {children}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}

function SectionHeader({ title }) {
  return (
    <div className="border-b border-gray-100 pb-2 mb-4">
      <h2 className="text-sm font-bold text-navy">{title}</h2>
    </div>
  );
}

export default function BuildForm({ onBuildStarted }) {
  const [form, setForm] = useState(INITIAL_FORM);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [globalError, setGlobalError] = useState('');

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    // Clear error on change if field was already validated
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
    if (Object.keys(allErrors).length > 0) {
      setErrors(allErrors);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/builds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      if (res.status === 201) {
        const data = await res.json();
        onBuildStarted(data.id);
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
      <div className="bg-white rounded-xl shadow p-6 space-y-8">

        {/* Section 1: Business Information */}
        <section>
          <SectionHeader title="Business Information" />
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
              <input
                className={inputClass}
                type="text"
                name="country"
                value={form.country}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder="US"
              />
            </Field>
          </div>
        </section>

        {/* Section 2: Configuration */}
        <section>
          <SectionHeader title="Configuration" />
          <div className="grid grid-cols-2 gap-4">
            <Field label="Industry" error={errors.industry}>
              <select
                className={inputClass}
                name="industry"
                value={form.industry}
                onChange={handleChange}
                onBlur={handleBlur}
              >
                <option value="">Select industry…</option>
                {INDUSTRIES.map((ind) => (
                  <option key={ind} value={ind}>{ind}</option>
                ))}
              </select>
            </Field>

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
        </section>

        {/* Section 3: Account Owner */}
        <section>
          <SectionHeader title="Account Owner" />
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
        </section>

        {/* Global error */}
        {globalError && (
          <p className="text-sm text-red-500 text-center">{globalError}</p>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-gradient-to-r from-magenta to-purple-700 text-white font-semibold
                     py-3 rounded-lg text-sm tracking-wide shadow hover:opacity-90
                     transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Creating…' : '🚀 Create Sub-Account'}
        </button>

      </div>
    </form>
  );
}
