import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import Button from '../components/controls/Button';
import Form, { Field, FormFooter } from '@atlaskit/form';
import Heading from '@atlaskit/heading';
import { Stack, Text } from '@atlaskit/primitives';
import SectionMessage from '@atlaskit/section-message';
import Textfield from '../components/controls/Textfield';
import { BRAND, pageTitle } from '../brand';
import { fieldErrorsFrom } from '../components/dialogs';
import { errorMessage } from '../components/feedback';
import { BrandLogo } from '../components/BrandLogo';
import { api } from '../lib/api';

function AuthFrame({ title, intro, children, footer }: { title: string; intro: string; children: ReactNode; footer: ReactNode }) {
  useEffect(() => {
    document.title = pageTitle(title);
  }, [title]);
  return (
    <main className="auth-page">
      <div className="auth-card">
        <Stack space="space.300">
          <Stack space="space.200" alignInline="center">
            <BrandLogo width={200} />
            <Heading size="medium" as="h1">
              {title}
            </Heading>
            <Text as="p" color="color.text.subtle" align="center">
              {intro}
            </Text>
          </Stack>
          {children}
          <Text as="p" align="center" color="color.text.subtle">
            {footer}
          </Text>
        </Stack>
      </div>
    </main>
  );
}

const required = (label: string) => (v?: string) => (!v || !v.trim() ? `Enter your ${label}` : undefined);
const email = (v?: string) => (!v || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? 'Enter a valid email address' : undefined);

interface LoginValues {
  email: string;
  password: string;
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  return (
    <AuthFrame title="Sign in" intro={`Welcome back to ${BRAND.name}.`} footer={<>New here? <Link to="/signup">Create an account</Link></>}>
      <Form<LoginValues>
        onSubmit={async (values) => {
          setError(null);
          try {
            await api.post('/auth/login', values);
            await qc.invalidateQueries({ queryKey: ['session'] });
            navigate((location.state as { from?: string } | null)?.from ?? '/', { replace: true });
          } catch (err) {
            setError(errorMessage(err));
          }
        }}
      >
        {({ formProps, submitting }) => (
          <form {...formProps} noValidate>
            <Stack space="space.100">
              {error && (
                <SectionMessage appearance="error">
                  <Text as="p">{error}</Text>
                </SectionMessage>
              )}
              <Field<string> name="email" label="Email" isRequired defaultValue="" validate={email} component={({ fieldProps }) => <Textfield {...fieldProps} type="email" autoComplete="email" />} />
              <Field<string>
                name="password"
                label="Password"
                isRequired
                defaultValue=""
                validate={required('password')}
                component={({ fieldProps }) => <Textfield {...fieldProps} type="password" autoComplete="current-password" />}
              />
              <FormFooter>
                <Button appearance="primary" type="submit" isLoading={submitting} shouldFitContainer>
                  Sign in
                </Button>
              </FormFooter>
            </Stack>
          </form>
        )}
      </Form>
    </AuthFrame>
  );
}

interface SignupValues {
  name: string;
  email: string;
  password: string;
  organization_name: string;
}

export function SignupPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  return (
    <AuthFrame
      title="Create your account"
      intro="Send transactional email from your own domains, with full delivery visibility."
      footer={<>Already have an account? <Link to="/login">Sign in</Link></>}
    >
      <Form<SignupValues>
        onSubmit={async (values) => {
          setError(null);
          try {
            await api.post('/auth/signup', values);
            await qc.invalidateQueries({ queryKey: ['session'] });
            navigate('/', { replace: true });
            return undefined;
          } catch (err) {
            const fields = fieldErrorsFrom(err, ['name', 'email', 'password', 'organization_name']);
            if (Object.keys(fields).length === 0) setError(errorMessage(err));
            return fields;
          }
        }}
      >
        {({ formProps, submitting }) => (
          <form {...formProps} noValidate>
            <Stack space="space.100">
              {error && (
                <SectionMessage appearance="error">
                  <Text as="p">{error}</Text>
                </SectionMessage>
              )}
              <Field<string> name="name" label="Your name" isRequired defaultValue="" validate={required('name')} component={({ fieldProps }) => <Textfield {...fieldProps} autoComplete="name" />} />
              <Field<string> name="email" label="Work email" isRequired defaultValue="" validate={email} component={({ fieldProps }) => <Textfield {...fieldProps} type="email" autoComplete="email" />} />
              <Field<string>
                name="password"
                label="Password"
                isRequired
                defaultValue=""
                helperMessage="At least 12 characters. A passphrase is easiest to remember."
                validate={(v) => (!v || v.length < 12 ? 'Use at least 12 characters' : undefined)}
                component={({ fieldProps }) => <Textfield {...fieldProps} type="password" autoComplete="new-password" />}
              />
              <Field<string>
                name="organization_name"
                label="Organization name"
                isRequired
                defaultValue=""
                helperMessage="Usually your company or project name. You can't change it yet."
                validate={required('organization name')}
                component={({ fieldProps }) => <Textfield {...fieldProps} autoComplete="organization" />}
              />
              <FormFooter>
                <Button appearance="primary" type="submit" isLoading={submitting} shouldFitContainer>
                  Create account
                </Button>
              </FormFooter>
              <Text as="p" size="small" color="color.text.subtle">
                Verify a sending domain to connect your application. Workspace sending limits are available in Settings.
              </Text>
            </Stack>
          </form>
        )}
      </Form>
    </AuthFrame>
  );
}
