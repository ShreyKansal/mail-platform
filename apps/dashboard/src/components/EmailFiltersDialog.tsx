import { Field } from '@atlaskit/form';
import { FormDialog } from './dialogs';
import { FilterSelect } from './FilterSelect';
import Textfield from './controls/Textfield';
import { ApiError } from '../lib/api';
import { EMAIL_FILTER_KEYS, emailFilterErrors, type EmailFilters } from '../lib/email-filters';

export function EmailFiltersDialog({value, statuses, keys, onApply, onClose}: {value: EmailFilters; statuses: Array<{label:string;value:string}>; keys?: Array<{id:string;name:string}>; onApply:(value:EmailFilters)=>void; onClose:()=>void}) {
  const select = (name: keyof EmailFilters, label: string, options: Array<{label:string;value:string}>) => <Field<string, HTMLSelectElement> name={name} label={label} defaultValue={value[name]} component={({fieldProps})=><FilterSelect {...fieldProps} fullWidth options={options} />} />;
  return <FormDialog<EmailFilters> title="Filter emails" submitLabel="Apply filters" fields={[...EMAIL_FILTER_KEYS]} onClose={onClose} onSubmit={async values=>{
    const next = {...value,...values};
    const errors = emailFilterErrors(next);
    if (errors.length) throw new ApiError(422,{code:'validation_error',message:'Check the date range.',details:errors},null);
    onApply(next); onClose();
  }}>
    {select('status','Status',statuses)}
    <div className="filter-date-fields"><Field<string,HTMLInputElement> name="after" label="From date" defaultValue={value.after} component={({fieldProps})=><Textfield {...fieldProps} type="date" />} /><Field<string,HTMLInputElement> name="before" label="To date" defaultValue={value.before} component={({fieldProps})=><Textfield {...fieldProps} type="date" />} /></div>
    {select('source','Source',[{label:'All sources',value:''},{label:'API',value:'api'},{label:'SMTP',value:'smtp'}])}
    {keys && select('api_key_id','API key',[{label:'All API keys',value:''},...keys.map(key=>({label:key.name,value:key.id}))])}
    {select('test_mode','Delivery mode',[{label:'Live and simulated',value:''},{label:'Live only',value:'false'},{label:'Simulated only',value:'true'}])}
  </FormDialog>;
}
