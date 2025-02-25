import { func, funcClass } from '../../../functionDefinition/functionDecorators';
import { LanguageTools } from '../languageTools';

@funcClass(__filename)
export class PhpTools implements LanguageTools {
	/**
	 * Generates an outline of a PHP project
	 */
	@func()
	async generateProjectMap(): Promise<string> {
		throw new Error('Not implemented');
	}

	async installPackage(packageName: string): Promise<void> {}
}
