import { FileSystem } from '#functions/filesystem';
import { GoogleCloud } from '#functions/google-cloud';
import { Jira } from '#functions/jira';
import { GitLab } from '#functions/scm/gitlab';
import { Slack } from '#functions/slack';
import { UtilFunctions } from '#functions/util';
import { Perplexity } from '#functions/web/perplexity';
import { CodeEditingAgent } from '#swe/codeEditingAgent';
import { SoftwareDeveloperAgent } from '#swe/softwareDeveloperAgent';

/**
 * Add any function classes to be made available here to ensure their function definitions are registered
 * @return the constructors for the function classes
 */
export function functionRegistry(): Array<new () => any> {
	return [
		CodeEditingAgent,
		FileSystem,
		GitLab,
		GoogleCloud,
		Jira,
		Perplexity,
		Slack,
		SoftwareDeveloperAgent,
		UtilFunctions,
		// Add your own classes below this line
	];
}
