import type { ReactNode } from 'react';
import Heading from '@atlaskit/heading';
import { Text } from '@atlaskit/primitives';
import { Table } from './Table';
import { CopyButton } from './dialogs';
import type { DnsRecord } from '../lib/api';

const names={ownership:'Ownership',dkim:'DKIM',return_path_mx:'Return-path MX',return_path_spf:'Return-path SPF',dmarc:'DMARC'};
export function DomainRecordGroups({records,status}:{records:DnsRecord[];status:(record:DnsRecord)=>ReactNode}){
 const renderTable=(selected:DnsRecord[],label:string)=><div className="domain-record-table"><Table compact label={`${label} DNS records`} isLoading={false} emptyView={<Text>No records.</Text>} columns={[{key:'type',content:'Type',width:9},{key:'name',content:'Name',width:28},{key:'value',content:'Value',width:37},{key:'ttl',content:'TTL',width:8},{key:'status',content:'Status',width:18}]} rows={selected.map(record=>({key:record.purpose,cells:[{content:record.type},{content:<div className="dns-record-copy"><span className="dns-record-text" title={record.host}>{record.host}</span><CopyButton value={record.host} label={`Copy host for ${names[record.purpose]}`}/></div>},{content:<div className="dns-record-value"><div className="dns-record-copy"><span className="dns-record-text" title={record.value}>{record.value}</span><CopyButton value={record.value} label={`Copy value for ${names[record.purpose]}`}/></div>{record.priority!=null&&<Text as="p" size="small" color="color.text.subtle">Priority {record.priority}</Text>}</div>},{content:'Auto'},{content:status(record)}]}))}/></div>;
 const verification=records.filter(record=>['ownership','dkim'].includes(record.purpose)),sending=records.filter(record=>['return_path_mx','return_path_spf'].includes(record.purpose)),dmarc=records.filter(record=>record.purpose==='dmarc');
 return <div className="domain-record-groups">
 {verification.length>0&&<section className="domain-record-group" aria-labelledby="domain-verification"><Heading as="h3" size="small" id="domain-verification">Domain verification</Heading>{verification.map(record=><div className="domain-record-subgroup" key={record.purpose}><Heading as="h4" size="xsmall">{names[record.purpose]}</Heading>{renderTable([record],names[record.purpose])}</div>)}</section>}
 {sending.length>0&&<section className="domain-record-group" aria-labelledby="domain-sending"><Heading as="h3" size="small" id="domain-sending">Sending</Heading><div className="domain-record-subgroup"><Heading as="h4" size="xsmall">SPF and return-path</Heading>{renderTable(sending,'SPF and return-path')}</div></section>}
 {dmarc.length>0&&<section className="domain-record-group" aria-labelledby="domain-dmarc"><Heading as="h3" size="xsmall" id="domain-dmarc">DMARC (optional)</Heading>{renderTable(dmarc,'DMARC')}<Text as="p" size="small" color="color.text.subtle">Keep your existing DMARC policy if you already have one.</Text></section>}
 </div>;
}
