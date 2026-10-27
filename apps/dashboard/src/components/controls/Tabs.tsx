import { Children, cloneElement, isValidElement, type ReactNode, type ReactElement } from 'react';
import { Tabs as Root, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
interface ChildProps { children?: ReactNode; value?: string; }
export default function Tabs({ children, selected, defaultSelected = 0, onChange, id, appearance = 'default' }: { children: ReactNode; selected?: number; defaultSelected?: number; onChange?: (index: number) => void; id: string; appearance?: 'default' | 'subtle' }) {
  let panel = 0;
  return <Root id={id} data-appearance={appearance} value={selected === undefined ? undefined : String(selected)} defaultValue={String(defaultSelected)} onValueChange={value => onChange?.(Number(value))} className="product-tabs min-w-0 w-full">{Children.map(children, child => isValidElement(child) && child.type === TabPanel ? cloneElement(child as ReactElement<ChildProps>, { value: String(panel++) }) : child)}</Root>;
}
export function TabList({ children }: ChildProps) {
  return <div className="product-tab-list-scroll max-w-full overflow-x-auto"><TabsList className="product-tab-list mb-4 h-10 gap-1 bg-muted p-1">{Children.map(children, (child, index) => isValidElement(child) ? cloneElement(child as ReactElement<ChildProps>, { value: String(index) }) : child)}</TabsList></div>;
}
export function Tab({ children, value = '0' }: ChildProps) { return <TabsTrigger value={value} className="product-tab cursor-pointer border-0 font-medium">{children}</TabsTrigger>; }
export function TabPanel({ children, value = '0' }: ChildProps) { return <TabsContent value={value} className="min-w-0 mt-0">{children}</TabsContent>; }
